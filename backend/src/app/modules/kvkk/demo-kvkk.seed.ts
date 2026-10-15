import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import { DataSource, IsNull } from 'typeorm';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity, DEFAULT_COMPANY } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { DistrictEntity, ProvinceEntity } from '../../entities/refdata.entity';
import { ConsentEntity, DsrRequestEntity, PrivacyNoticeEntity, RetentionPolicyEntity, SecurityIncidentEntity, SubprocessorEntity } from '../../entities/kvkk.entity';
import { LEGAL_PARAMETER_SEEDS, WP7_PARAMETER_KEYS, WP7R1_PARAMETER_KEYS } from '../../shared/legal/legal-parameter-seeds';
import { ensureAuditTriggers } from '../../shared/kvkk/audit-chain';
import { RETENTION_DEFAULTS } from '../../shared/kvkk/retention';
import { buildPrivacyNotice, platformDocument } from '../../shared/kvkk/notice-template';
import { LEGACY_PLATFORM_INTEGRATOR_NAME, PLATFORM_OPERATOR, PLATFORM_SUBPROCESSORS, retentionLabel } from '../../shared/kvkk/platform';
import { tcknCheckDigits } from '../../shared/tr';
import { NoticeService } from './notice.service';
import { RetentionService } from './retention.service';

const SEED_USER = 'SeedSystem';
const ZEYNEP_TCKN = '348129576' + tcknCheckDigits('348129576').join('');
const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const daysAgo = (n: number, h = 10, min = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(h - 3, min, 0, 0); // Europe/Istanbul local time
  return d;
};

/**
 * WP7 safety net and demo data (after every module's init):
 *  - audit / destruction / acceptance triggers, WP7 legal parameters, global retention policies,
 *    platform documents and sub-processors for databases built by schema sync;
 *  - demo tenant (idempotent; marker: a published CUSTOMER privacy notice): KVKK contact and VERBİS
 *    inputs, published privacy notices (customers TR / EN, employees TR) and a supplier draft, the
 *    e-Belge integrator as a sub-processor, an individual customer with a valid TCKN, notice record
 *    and marketing consents (one withdrawn), two data-subject requests (an access request in
 *    progress, an erasure request awaiting identity verification), a closed breach record and a
 *    pending periodic destruction candidate list.
 */
@Injectable()
export class KvkkDemoSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger('KvkkDemoSeeder');

  constructor(
    private readonly ds: DataSource,
    private readonly tenant: TenantContext,
    private readonly notices: NoticeService,
    private readonly retention: RetentionService,
  ) {}

  async onApplicationBootstrap() {
    if (process.env.NODE_ENV === 'test') return;
    try {
      const created = await ensureAuditTriggers((sql, params) => this.ds.query(sql, params));
      if (created.length) this.logger.log(`Created KVKK triggers: ${created.join(', ')}`);
      await this.ensureGlobals();
      await this.tenant.run(DEFAULT_COMPANY.id, () => this.seedDemo());
      await this.tenant.run(DEFAULT_COMPANY.id, () => this.republishNoticesWithoutLegacyIntegrator());
    } catch (e) {
      this.logger.warn(`WP7 demo seed skipped: ${(e as Error).message}`);
    }
  }

  /**
   * WP7 review r1: published demo notices listed the e-Belge integrator twice (the tenant's entry and
   * the former platform-wide placeholder). A corrected version is generated and published once.
   */
  private async republishNoticesWithoutLegacyIntegrator() {
    const companyId = DEFAULT_COMPANY.id;
    const stale = await this.ds.manager.find(PrivacyNoticeEntity, { where: { companyId, status: 'PUBLISHED' } });
    for (const n of stale.filter((x) => x.body.includes(LEGACY_PLATFORM_INTEGRATOR_NAME))) {
      const [major, minor] = n.version.split('.').map((x) => Number(x) || 0);
      const version = `${major}.${minor + 1}`;
      if (await this.ds.manager.exists(PrivacyNoticeEntity, { where: { companyId, docType: n.docType, audience: n.audience, language: n.language, version } })) continue;
      const draft = await this.notices.create({ audience: n.audience, language: n.language, version }, SEED_USER);
      await this.notices.publish(draft.id, SEED_USER);
      this.logger.log(`Republished ${n.audience}/${n.language} privacy notice as ${version} (integrator listed once)`);
    }
  }

  private async ensureGlobals() {
    const m = this.ds.manager;
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP7_PARAMETER_KEYS.includes(x.key) || WP7R1_PARAMETER_KEYS.includes(x.key))) {
      await this.ds.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note || null, 'seed'],
      );
    }
    for (const d of RETENTION_DEFAULTS) {
      if (await m.exists(RetentionPolicyEntity, { where: { companyId: IsNull(), dataCategory: d.dataCategory } })) continue;
      await m.insert(RetentionPolicyEntity, { ...d, companyId: null });
    }
    if (!(await m.exists(PrivacyNoticeEntity, { where: { companyId: IsNull() } }))) {
      for (const lang of ['tr', 'en'] as const) {
        const docs = [
          { docType: 'TOS', ...platformDocument('TOS', lang) },
          { docType: 'DPA', ...platformDocument('DPA', lang) },
          { docType: 'PRIVACY', ...buildPrivacyNotice(PLATFORM_OPERATOR, 'USER', lang, PLATFORM_SUBPROCESSORS, [], (c) => retentionLabel(c, lang)) },
        ];
        for (const d of docs) {
          await m.insert(PrivacyNoticeEntity, { companyId: null, docType: d.docType, audience: 'USER', language: lang, version: '1.0', title: d.title, body: d.body, contentSha256: sha256(`${d.title}\n${d.body}`), status: 'PUBLISHED', publishedAt: new Date(), publishedBy: 'seed', createdBy: 'seed' });
        }
      }
    }
    if (!(await m.exists(SubprocessorEntity, { where: { companyId: IsNull() } }))) {
      for (const p of PLATFORM_SUBPROCESSORS) await m.insert(SubprocessorEntity, { ...p, companyId: null, active: true });
    }
    // WP7 review r1: the platform privacy notice listed the companies' e-Belge integrator as a platform
    // sub-processor; a corrected version (with the operator identity fields) replaces it once.
    const stale = await m.find(PrivacyNoticeEntity, { where: { companyId: IsNull(), docType: 'PRIVACY', audience: 'USER', status: 'PUBLISHED' } });
    for (const n of stale.filter((x) => x.body.includes(LEGACY_PLATFORM_INTEGRATOR_NAME))) {
      const lang = n.language === 'en' ? 'en' : 'tr';
      const [major, minor] = n.version.split('.').map((x) => Number(x) || 0);
      const d = buildPrivacyNotice(PLATFORM_OPERATOR, 'USER', lang, PLATFORM_SUBPROCESSORS, [], (c) => retentionLabel(c, lang));
      const now = new Date();
      await m.update(PrivacyNoticeEntity, { id: n.id }, { status: 'RETIRED', retiredAt: now });
      await m.insert(PrivacyNoticeEntity, { companyId: null, docType: 'PRIVACY', audience: 'USER', language: lang, version: `${major}.${minor + 1}`, title: d.title, body: d.body, contentSha256: sha256(`${d.title}\n${d.body}`), status: 'PUBLISHED', publishedAt: now, publishedBy: 'seed', createdBy: 'seed' });
      this.logger.log(`Republished the platform privacy notice (${lang}) as ${major}.${minor + 1}`);
    }
  }

  private async seedDemo() {
    const m = this.ds.manager;
    const companyId = DEFAULT_COMPANY.id;
    if (!(await m.exists(CompanyEntity, { where: { id: companyId } }))) return;
    if (await m.exists(PrivacyNoticeEntity, { where: { companyId, audience: 'CUSTOMER', status: 'PUBLISHED' } })) return;
    this.logger.log('Seeding KVKK demo data...');

    // Company KVKK contact and VERBİS inputs (below the thresholds: registration not required).
    await m.update(CompanyEntity, { id: companyId }, { kvkkContactEmail: 'kvkk@demosirketi.com.tr', verbisEmployeeCount: 18, verbisBalanceSheetTotal: 42500000, verbisMainActivitySpecial: false, verbisRegistered: false });

    // The company's e-Belge integrator (processor); the demo uses the mock provider.
    if (!(await m.exists(SubprocessorEntity, { where: { companyId } }))) {
      await m.insert(SubprocessorEntity, {
        companyId, name: 'Özel entegratör (demo: Mock e-Belge sağlayıcısı)', service: 'e-Fatura / e-Arşiv / e-İrsaliye imza, GİB iletimi ve yasal arşiv', country: 'TR', transferBasis: 'DOMESTIC',
        dataCategories: ['Kimlik', 'İletişim', 'Müşteri İşlem'], dpaSignedAt: '2026-01-05', active: true,
      });
    }

    // Privacy notices generated from the company data, published v1.0.
    const publish = async (audience: string, language: string, publishNow: boolean) => {
      const n = await this.notices.create({ audience, language, version: '1.0' }, SEED_USER);
      if (publishNow) await this.notices.publish(n.id, SEED_USER);
      return n;
    };
    await publish('CUSTOMER', 'tr', true);
    await publish('CUSTOMER', 'en', true);
    await publish('EMPLOYEE', 'tr', true);
    await publish('SUPPLIER', 'tr', false);

    // An individual customer with a checksum-valid TCKN (Kadıköy / İstanbul), notice and consents.
    let zeynep = await m.findOne(CustomerEntity, { where: { companyId, identityNumber: ZEYNEP_TCKN } });
    if (!zeynep) {
      const district = await m.findOne(DistrictEntity, { where: { provinceCode: '34', name: 'Kadıköy' } });
      const province = await m.findOne(ProvinceEntity, { where: { code: '34' } });
      zeynep = await m.save(
        CustomerEntity,
        m.create(CustomerEntity, {
          companyId, name: 'Zeynep Arslan', type: 'individual', identityType: 'TCKN', identityNumber: ZEYNEP_TCKN, email: 'zeynep.arslan@ornekposta.com.tr', phone: '+90 532 418 27 63',
          isVatTaxpayer: false, isDesignatedBuyer: false, needsReview: false, currency: 'TRY',
          noticeGivenAt: daysAgo(40, 14, 5), noticeVersion: '1.0', noticeChannel: 'WEB',
          address: { line1: 'Caferağa Mah. Moda Cad. No: 12 D: 4', line2: null, districtId: district?.id ?? null, district: district?.name ?? 'Kadıköy', provinceCode: '34', province: province?.name ?? 'İstanbul', postalCode: '34710', country: 'TR', uavtCode: null } as any,
        }),
      );
      await m.insert(ConsentEntity, { companyId, subjectType: 'CUSTOMER', subjectId: zeynep.id, purposeCode: 'MARKETING_EMAIL', channel: 'WEB', textVersion: '1.0', givenAt: daysAgo(40, 14, 6), evidence: 'Web formu - ayrı onay kutusu (önceden işaretli değil)', recordedBy: SEED_USER });
      await m.insert(ConsentEntity, { companyId, subjectType: 'CUSTOMER', subjectId: zeynep.id, purposeCode: 'MARKETING_SMS', channel: 'WEB', textVersion: '1.0', givenAt: daysAgo(40, 14, 6), withdrawnAt: daysAgo(6, 9, 40), withdrawnChannel: 'SMS', evidence: 'Web formu; geri alma: SMS ile RET yanıtı', recordedBy: SEED_USER });
    }

    // Data-subject requests: an access request in progress (identity verified) and an erasure
    // request awaiting identity verification (due soon).
    const selin = await m.findOne(CustomerEntity, { where: { companyId, name: 'Selin Aydın' } });
    const kaan = await m.findOne(CustomerEntity, { where: { companyId, name: 'Kaan Doğan' } });
    if (!(await m.exists(DsrRequestEntity, { where: { companyId } }))) {
      const year = new Date().getUTCFullYear();
      if (selin) {
        const receivedAt = daysAgo(22, 11, 15);
        await m.insert(DsrRequestEntity, {
          companyId, requestNo: `KVKK-${year}-0001`, subjectType: 'CUSTOMER', subjectId: selin.id, applicantName: 'Selin Aydın', applicantContact: 'selin.aydin@ornekposta.com.tr',
          requestType: 'ACCESS', channel: 'REGISTERED_EMAIL', description: 'Hakkımda işlenen tüm kişisel verilerin ve aktarıldığı kişilerin listesini talep ediyorum.',
          receivedAt, dueAt: new Date(receivedAt.getTime() + 30 * 86400000), status: 'IN_PROGRESS', identityVerifiedAt: daysAgo(21, 9, 30), identityVerifiedBy: 'admin',
          identityVerificationMethod: 'Sistemde kayıtlı e-posta adresinden gönderildi; sipariş numarası ile teyit', createdBy: 'admin',
        });
      }
      if (kaan) {
        const receivedAt = daysAgo(26, 15, 0);
        await m.insert(DsrRequestEntity, {
          companyId, requestNo: `KVKK-${year}-0002`, subjectType: 'CUSTOMER', subjectId: kaan.id, applicantName: 'Kaan Doğan', applicantContact: 'Kadıköy / İstanbul (posta adresi başvuru dilekçesinde)',
          requestType: 'ERASURE', channel: 'WRITTEN', description: 'Kişisel verilerimin silinmesini ve pazarlama amaçlı kullanılmamasını talep ediyorum.',
          receivedAt, dueAt: new Date(receivedAt.getTime() + 30 * 86400000), status: 'RECEIVED', createdBy: 'admin',
        });
      }
    }

    // A closed breach record (notified to the Board within 72 hours).
    if (!(await m.exists(SecurityIncidentEntity, { where: { companyId } }))) {
      const aware = daysAgo(58, 10, 30);
      await m.insert(SecurityIncidentEntity, {
        companyId, incidentNo: `IHL-${aware.getUTCFullYear()}-0001`, title: 'Şifresiz USB bellek kaybı (sevkiyat listesi)', source: 'MANUAL', severity: 'MEDIUM', status: 'CLOSED',
        description: 'Depo sorumlusunun kullandığı, 42 müşterinin teslimat adresi ve telefonunu içeren şifresiz USB bellek kaybolmuştur.',
        detectedAt: aware, awareAt: aware, deadlineAt: new Date(aware.getTime() + 72 * 3600000), dataCategories: ['İletişim', 'Müşteri İşlem'], affectedSubjectTypes: ['CUSTOMER'], affectedCount: 42,
        affectedFrom: daysAgo(90), affectedTo: aware, boardNotifiedAt: daysAgo(56, 16, 0), boardNotificationRef: 'Kurul ihlal bildirim formu (demo kaydı)', subjectsNotifiedAt: daysAgo(55, 11, 0),
        measures: 'Taşınabilir bellek kullanımı kısıtlandı; sevkiyat listeleri yalnızca uygulamadan, yetkiyle görüntülenir. Etkilenen kişilere SMS ve e-posta ile bildirim yapıldı.',
        closedAt: daysAgo(50, 12, 0), createdBy: 'admin',
      });
    }

    // Periodic destruction: a candidate list awaiting the administrator's approval.
    const runs = await this.retention.runs();
    if (!runs.length) await this.retention.createRun('SCHEDULED', SEED_USER, companyId);
    this.logger.log('KVKK demo data seeded.');
  }
}
