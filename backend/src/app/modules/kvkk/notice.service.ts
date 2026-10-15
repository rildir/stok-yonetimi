import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, In, IsNull } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { LegalAcceptanceEntity, PrivacyNoticeEntity, RetentionPolicyEntity, SubprocessorEntity } from '../../entities/kvkk.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { formatAddress } from '../../entities/address.embedded';
import { WebhookEndpointEntity } from '../../entities/webhook-endpoint.entity';
import { NOTICE_AUDIENCES, NOTICE_DOC_TYPES, NoticeAudience, buildPrivacyNotice } from '../../shared/kvkk/notice-template';
import { retentionLabel } from '../../shared/kvkk/platform';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export interface NoticeInput {
  docType?: string;
  audience?: string;
  language?: string;
  version?: string;
  title?: string;
  body?: string;
}

/**
 * Privacy notices (aydınlatma metinleri, KVKK md. 10) per audience / language / version, the
 * platform documents (TOS, DPA) and the acceptance records (R57). A published text is frozen by a
 * trigger; publishing a new version retires the previous one of the same scope.
 */
@Injectable()
export class NoticeService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly tenant: TenantContext) {}

  private get companyId() {
    return this.tenant.companyId;
  }

  async list() {
    return this.ds.manager.find(PrivacyNoticeEntity, {
      where: [{ companyId: this.companyId }, { companyId: IsNull() }],
      order: { docType: 'ASC', audience: 'ASC', language: 'ASC', createdAt: 'DESC' },
    });
  }

  async get(id: string) {
    const n = await this.ds.manager.findOne(PrivacyNoticeEntity, { where: [{ id, companyId: this.companyId }, { id, companyId: IsNull() }] });
    if (!n) throw new NotFoundException(err('NOTICE_NOT_FOUND'));
    return n;
  }

  /** Retention text of a category: the tenant's override, else the global default. */
  async retentionTexts(lang: 'tr' | 'en'): Promise<(category: string) => string> {
    const rows = await this.ds.manager.find(RetentionPolicyEntity, { where: [{ companyId: this.companyId }, { companyId: IsNull() }] });
    return (category: string) => {
      const p = rows.find((r) => r.dataCategory === category && r.companyId) || rows.find((r) => r.dataCategory === category);
      return retentionLabel(category, lang, p ?? null);
    };
  }

  /** Default text filled from the company identity, inventory, sub-processors and transfers (a draft to review). */
  async generate(audience: string, lang: string): Promise<{ title: string; body: string }> {
    if (!(NOTICE_AUDIENCES as string[]).includes(audience)) throw new BadRequestException(err('NOTICE_AUDIENCE_INVALID'));
    const l = lang === 'en' ? 'en' : 'tr';
    const c = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const subs = await this.ds.manager.find(SubprocessorEntity, { where: [{ companyId: this.companyId, active: true }, { companyId: IsNull(), active: true }] });
    const hooks = await this.ds.manager.find(WebhookEndpointEntity, { where: { companyId: this.companyId, active: true } });
    const transfers = hooks.map((h) => ({ name: safeHost(h.url), service: 'Webhook entegrasyonu', country: h.destinationCountry, transferBasis: h.transferBasis }));
    return buildPrivacyNotice(
      { legalName: c.legalName, name: c.name, taxIdType: c.taxIdType, taxId: c.taxId, mersisNo: c.mersisNo, addressText: formatAddress(c.address as any), kepAddress: c.kepAddress, email: c.email, kvkkContactEmail: c.kvkkContactEmail, phone: c.phone, website: c.website },
      audience as NoticeAudience,
      l,
      subs.map((s) => ({ name: s.name, service: s.service, country: s.country, transferBasis: s.transferBasis })),
      transfers,
      await this.retentionTexts(l),
    );
  }

  async create(input: NoticeInput, username: string) {
    const docType = input.docType || 'PRIVACY';
    if (!(NOTICE_DOC_TYPES as readonly string[]).includes(docType) || docType !== 'PRIVACY') throw new BadRequestException(err('NOTICE_AUDIENCE_INVALID'));
    if (!input.audience || !(NOTICE_AUDIENCES as string[]).includes(input.audience) || input.audience === 'USER') throw new BadRequestException(err('NOTICE_AUDIENCE_INVALID'));
    const language = input.language === 'en' ? 'en' : 'tr';
    const version = (input.version || '').trim();
    if (!version) throw new BadRequestException(err('VALIDATION_FAILED'));
    const exists = await this.ds.manager.exists(PrivacyNoticeEntity, { where: { companyId: this.companyId, docType, audience: input.audience, language, version } });
    if (exists) throw new BadRequestException(err('NOTICE_VERSION_EXISTS', { version }));
    const gen = !input.body || !input.title ? await this.generate(input.audience, language) : null;
    return this.ds.manager.save(
      PrivacyNoticeEntity,
      this.ds.manager.create(PrivacyNoticeEntity, {
        companyId: this.companyId,
        docType,
        audience: input.audience,
        language,
        version,
        title: input.title || gen!.title,
        body: input.body || gen!.body,
        status: 'DRAFT',
        createdBy: username,
      }),
    );
  }

  private async tenantNotice(id: string) {
    const n = await this.ds.manager.findOne(PrivacyNoticeEntity, { where: { id, companyId: this.companyId } });
    if (!n) throw new NotFoundException(err('NOTICE_NOT_FOUND'));
    return n;
  }

  async update(id: string, input: NoticeInput) {
    const n = await this.tenantNotice(id);
    if (n.status !== 'DRAFT') throw new BadRequestException(err('NOTICE_NOT_DRAFT'));
    if (input.title !== undefined) n.title = input.title;
    if (input.body !== undefined) n.body = input.body;
    if (input.version !== undefined && input.version.trim() && input.version.trim() !== n.version) {
      const exists = await this.ds.manager.exists(PrivacyNoticeEntity, { where: { companyId: this.companyId, docType: n.docType, audience: n.audience, language: n.language, version: input.version.trim() } });
      if (exists) throw new BadRequestException(err('NOTICE_VERSION_EXISTS', { version: input.version }));
      n.version = input.version.trim();
    }
    return this.ds.manager.save(PrivacyNoticeEntity, n);
  }

  /** Publishes a draft (content hash fixed); the previous published version of the scope is retired. */
  async publish(id: string, username: string) {
    return this.ds.transaction(async (m) => {
      const n = await m.findOne(PrivacyNoticeEntity, { where: { id, companyId: this.companyId }, lock: { mode: 'pessimistic_write' } });
      if (!n) throw new NotFoundException(err('NOTICE_NOT_FOUND'));
      if (n.status !== 'DRAFT') throw new BadRequestException(err('NOTICE_NOT_DRAFT'));
      const now = new Date();
      const previous = await m.find(PrivacyNoticeEntity, { where: { companyId: this.companyId, docType: n.docType, audience: n.audience, language: n.language, status: 'PUBLISHED' } });
      for (const p of previous) await m.update(PrivacyNoticeEntity, { id: p.id }, { status: 'RETIRED', retiredAt: now });
      n.status = 'PUBLISHED';
      n.publishedAt = now;
      n.publishedBy = username;
      n.contentSha256 = sha256(`${n.title}\n${n.body}`);
      return m.save(PrivacyNoticeEntity, n);
    });
  }

  async retire(id: string) {
    const n = await this.tenantNotice(id);
    if (n.status !== 'PUBLISHED') throw new BadRequestException(err('NOTICE_NOT_DRAFT'));
    await this.ds.manager.update(PrivacyNoticeEntity, { id: n.id }, { status: 'RETIRED', retiredAt: new Date() });
    return this.get(id);
  }

  async deleteDraft(id: string) {
    const n = await this.tenantNotice(id);
    if (n.status !== 'DRAFT') throw new BadRequestException(err('NOTICE_NOT_DRAFT'));
    await this.ds.manager.delete(PrivacyNoticeEntity, { id: n.id });
    return { success: true };
  }

  /** Platform document (no tenant; login screen). */
  async platformCurrent(docType: string, audience: string, lang: string) {
    const language = lang === 'en' ? 'en' : 'tr';
    const rows = await this.ds.manager.find(PrivacyNoticeEntity, { where: { companyId: IsNull(), docType, audience, status: 'PUBLISHED' }, order: { publishedAt: 'DESC' } });
    return rows.find((r) => r.language === language) || rows[0] || null;
  }

  /** Current notice for a signed-in user: the tenant's published one for the audience, else the platform's. */
  async current(audience: string, lang: string) {
    const language = lang === 'en' ? 'en' : 'tr';
    const rows = await this.ds.manager.find(PrivacyNoticeEntity, { where: { companyId: this.companyId, docType: 'PRIVACY', audience, status: 'PUBLISHED' }, order: { publishedAt: 'DESC' } });
    const own = rows.find((r) => r.language === language) || rows[0];
    if (own) return own;
    return this.platformCurrent('PRIVACY', 'USER', language);
  }

  /**
   * Documents the user still has to accept / acknowledge at sign-in (R57): the employees' privacy
   * notice (tenant EMPLOYEE notice, else the platform's) and, for administrators, the terms of service
   * and the processing agreement on behalf of the company.
   */
  async pending(user: { sub: string; role: string }, lang: string) {
    const docs: PrivacyNoticeEntity[] = [];
    const notice = await this.current('EMPLOYEE', lang);
    if (notice) docs.push(notice);
    if (user.role === 'admin') {
      for (const t of ['TOS', 'DPA']) {
        const d = await this.platformCurrent(t, 'USER', lang);
        if (d) docs.push(d);
      }
    }
    if (!docs.length) return [];
    const accepted = await this.ds.manager.find(LegalAcceptanceEntity, { where: { companyId: this.companyId, userId: user.sub, noticeId: In(docs.map((d) => d.id)) } });
    const done = new Set(accepted.map((a) => a.noticeId));
    return docs.filter((d) => !done.has(d.id));
  }

  async accept(noticeIds: string[], user: { sub: string; username: string; role: string }, req: any) {
    const notices = await this.ds.manager.find(PrivacyNoticeEntity, { where: [{ id: In(noticeIds), companyId: this.companyId, status: 'PUBLISHED' }, { id: In(noticeIds), companyId: IsNull(), status: 'PUBLISHED' }] });
    if (!notices.length) throw new NotFoundException(err('NOTICE_NOT_FOUND'));
    const fwd = req?.headers?.['x-forwarded-for'];
    const ip = ((typeof fwd === 'string' && fwd.split(',')[0].trim()) || req?.ip || '').toString().slice(0, 64) || null;
    const ua = (req?.headers?.['user-agent'] || '').toString().slice(0, 255) || null;
    const existing = await this.ds.manager.find(LegalAcceptanceEntity, { where: { companyId: this.companyId, userId: user.sub, noticeId: In(notices.map((n) => n.id)) } });
    const done = new Set(existing.map((e) => e.noticeId));
    for (const n of notices) {
      if (done.has(n.id)) continue;
      await this.ds.manager.insert(LegalAcceptanceEntity, {
        companyId: this.companyId, userId: user.sub, username: user.username, noticeId: n.id, docType: n.docType, audience: n.audience, version: n.version, language: n.language, contentSha256: n.contentSha256 ?? null, ip, userAgent: ua,
      });
    }
    return { accepted: notices.length };
  }

  async acceptances() {
    return this.ds.manager.find(LegalAcceptanceEntity, { where: { companyId: this.companyId }, order: { acceptedAt: 'DESC' }, take: 500 });
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 60);
  }
}
