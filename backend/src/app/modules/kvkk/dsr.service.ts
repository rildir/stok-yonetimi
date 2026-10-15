import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource, In } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { DsrRequestEntity } from '../../entities/kvkk.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { LegalParameterService } from '../../shared/services/legal-parameter.service';
import { AppGateway } from '../../app.gateway';
import { kvkkDaysLeft, todayKey } from '../../shared/tr';
import { ErasureService, erasureResponseText } from './erasure.service';

export const DSR_TYPES = ['ACCESS', 'INFO', 'PURPOSE', 'TRANSFER_INFO', 'RECTIFICATION', 'ERASURE', 'OBJECTION', 'COMPENSATION'] as const;
/** Başvuru Tebliği md. 5: yazılı, KEP, güvenli elektronik imza, mobil imza, kayıtlı e-posta, uygulama */
export const DSR_CHANNELS = ['WRITTEN', 'KEP', 'E_SIGNATURE', 'MOBILE_SIGNATURE', 'REGISTERED_EMAIL', 'APPLICATION', 'IN_PERSON'] as const;
export const DSR_SUBJECT_TYPES = ['CUSTOMER', 'SUPPLIER', 'USER', 'OTHER'] as const;
const OPEN = ['RECEIVED', 'IN_PROGRESS'];

export interface DsrInput {
  subjectType: string;
  subjectId?: string | null;
  applicantName: string;
  applicantContact?: string | null;
  requestType: string;
  channel: string;
  description?: string | null;
  receivedAt?: string | null;
}

/**
 * Data-subject requests (R59): received -> identity verified -> answered within 30 days (KVKK md.
 * 13/2; the period is the legal parameter KVKK_DSR_RESPONSE_DAYS). Erasure needs a verified identity
 * (DSR_IDENTITY_NOT_VERIFIED) and is applied without breaching legal retention: a partial result
 * carries the reasoned answer. Administrators are reminded daily of requests due within 7 days.
 */
@Injectable()
export class DsrService {
  private readonly logger = new Logger(DsrService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenant: TenantContext,
    private readonly legal: LegalParameterService,
    private readonly erasure: ErasureService,
    private readonly gateway: AppGateway,
  ) {}

  private get companyId() {
    return this.tenant.companyId;
  }

  private present(r: DsrRequestEntity, now = new Date()) {
    const open = OPEN.includes(r.status);
    return { ...r, daysLeft: open ? kvkkDaysLeft(r.dueAt, now) : null, overdue: open && new Date(r.dueAt).getTime() < now.getTime() };
  }

  async list(status?: string) {
    const where: Record<string, unknown> = { companyId: this.companyId };
    if (status === 'open') where['status'] = In(OPEN);
    else if (status) where['status'] = status;
    const rows = await this.ds.manager.find(DsrRequestEntity, { where, order: { dueAt: 'ASC' }, take: 500 });
    return rows.map((r) => this.present(r));
  }

  private async find(id: string) {
    const r = await this.ds.manager.findOne(DsrRequestEntity, { where: { id, companyId: this.companyId } });
    if (!r) throw new NotFoundException(err('DSR_NOT_FOUND'));
    return r;
  }

  async get(id: string) {
    return this.present(await this.find(id));
  }

  private async assertSubject(type: string, id: string | null | undefined) {
    if (!id) return;
    const repo = type === 'CUSTOMER' ? CustomerEntity : type === 'SUPPLIER' ? SupplierEntity : null;
    if (!repo) return;
    const ok = await this.ds.manager.exists(repo as any, { where: { id, companyId: this.companyId } });
    if (!ok) throw new NotFoundException(err(type === 'CUSTOMER' ? 'CUSTOMER_NOT_FOUND' : 'SUPPLIER_NOT_FOUND'));
  }

  /** Due date = receipt + KVKK_DSR_RESPONSE_DAYS (30) days. */
  async dueDate(receivedAt: Date): Promise<Date> {
    const c = await this.ds.manager.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const days = Number((await this.legal.paramOrNull<number>('KVKK_DSR_RESPONSE_DAYS', todayKey(c.timezone, receivedAt), c.country || 'TR')) ?? 30);
    return new Date(receivedAt.getTime() + days * 86400000);
  }

  async create(input: DsrInput, username: string) {
    if (!(DSR_TYPES as readonly string[]).includes(input.requestType)) throw new BadRequestException(err('DSR_TYPE_INVALID'));
    if (!(DSR_CHANNELS as readonly string[]).includes(input.channel)) throw new BadRequestException(err('VALIDATION_FAILED'));
    if (!(DSR_SUBJECT_TYPES as readonly string[]).includes(input.subjectType)) throw new BadRequestException(err('SUBJECT_TYPE_INVALID'));
    await this.assertSubject(input.subjectType, input.subjectId);
    const receivedAt = input.receivedAt ? new Date(input.receivedAt) : new Date();
    if (Number.isNaN(receivedAt.getTime()) || receivedAt.getTime() > Date.now() + 60000) throw new BadRequestException(err('VALIDATION_DATE'));
    const dueAt = await this.dueDate(receivedAt);
    return this.ds.transaction(async (m) => {
      const year = receivedAt.getUTCFullYear();
      const n = await m.count(DsrRequestEntity, { where: { companyId: this.companyId } });
      const r = await m.save(
        DsrRequestEntity,
        m.create(DsrRequestEntity, {
          companyId: this.companyId,
          requestNo: `KVKK-${year}-${String(n + 1).padStart(4, '0')}`,
          subjectType: input.subjectType,
          subjectId: input.subjectId || null,
          applicantName: input.applicantName.trim(),
          applicantContact: input.applicantContact || null,
          requestType: input.requestType,
          channel: input.channel,
          description: input.description || null,
          receivedAt,
          dueAt,
          status: 'RECEIVED',
          createdBy: username,
        }),
      );
      return this.present(r);
    });
  }

  /** Identity verification (Başvuru Tebliği md. 5/3: the controller may ask for proof of identity). */
  async verifyIdentity(id: string, method: string, username: string) {
    const r = await this.find(id);
    if (!OPEN.includes(r.status)) throw new BadRequestException(err('DSR_CLOSED'));
    r.identityVerifiedAt = new Date();
    r.identityVerifiedBy = username;
    r.identityVerificationMethod = (method || '').slice(0, 255) || 'Belge kontrolü';
    r.status = 'IN_PROGRESS';
    return this.present(await this.ds.manager.save(DsrRequestEntity, r));
  }

  private assertVerified(r: DsrRequestEntity) {
    if (!r.identityVerifiedAt) throw new BadRequestException(err('DSR_IDENTITY_NOT_VERIFIED'));
  }

  /** Access requests: the subject report needs a verified identity too. */
  async assertCanExport(id: string) {
    const r = await this.find(id);
    this.assertVerified(r);
    if (!r.subjectId || !['CUSTOMER', 'SUPPLIER', 'USER'].includes(r.subjectType)) throw new BadRequestException(err('DSR_SUBJECT_REQUIRED'));
    return r;
  }

  /** Erasure (KVKK md. 7, 11/1-e): applied as far as the legal retention allows; reasoned answer. */
  async erase(id: string, username: string, userId: string | null, lang: 'tr' | 'en' = 'tr') {
    const r = await this.find(id);
    if (!OPEN.includes(r.status)) throw new BadRequestException(err('DSR_CLOSED'));
    this.assertVerified(r);
    if (!r.subjectId) throw new BadRequestException(err('DSR_SUBJECT_REQUIRED'));
    if (!['CUSTOMER', 'SUPPLIER'].includes(r.subjectType)) throw new BadRequestException(err('DSR_ERASURE_SUBJECT_UNSUPPORTED'));
    const ctx = { reason: `İlgili kişi başvurusu ${r.requestNo} (KVKK md. 7, 11)`, dsrId: r.id, performedBy: username, performedByUserId: userId };
    const result = r.subjectType === 'CUSTOMER' ? await this.erasure.eraseCustomer(r.subjectId, ctx) : await this.erasure.eraseSupplier(r.subjectId, ctx);
    const responseText = erasureResponseText(result, r.applicantName, lang);
    await this.ds.manager.update(DsrRequestEntity, { id: r.id }, {
      status: result.mode === 'FULL' ? 'COMPLETED' : 'PARTIALLY_COMPLETED',
      outcome: { erasure: result, restrictionCode: result.mode === 'PARTIAL' ? 'ERASURE_RESTRICTED_BY_RETENTION' : null } as any,
      responseText,
      respondedAt: new Date(),
      respondedBy: username,
    });
    return { request: await this.get(id), result, responseText };
  }

  /** Closes a request with the answer sent to the applicant. */
  async respond(id: string, status: string, responseText: string, username: string) {
    const r = await this.find(id);
    if (!OPEN.includes(r.status)) throw new BadRequestException(err('DSR_CLOSED'));
    if (!['COMPLETED', 'PARTIALLY_COMPLETED', 'REJECTED'].includes(status)) throw new BadRequestException(err('VALIDATION_FAILED'));
    if (status !== 'REJECTED') this.assertVerified(r);
    if (!responseText?.trim()) throw new BadRequestException(err('DSR_RESPONSE_REQUIRED'));
    await this.ds.manager.update(DsrRequestEntity, { id: r.id }, { status, responseText: responseText.trim(), respondedAt: new Date(), respondedBy: username });
    return this.get(id);
  }

  /** Daily 09:00 job. */
  @Cron('0 9 * * *')
  async dailyReminders(): Promise<number> {
    if (process.env.JEST_WORKER_ID) return 0;
    try {
      return await this.remind();
    } catch (e) {
      this.logger.warn(`DSR reminders: ${(e as Error).message}`);
      return 0;
    }
  }

  /** Reminds the administrators of requests due within 7 days or overdue (once a day per request). */
  async remind(now = new Date()): Promise<number> {
    const rows = await this.ds.manager.find(DsrRequestEntity, { where: { status: In(OPEN) } });
    let sent = 0;
    for (const r of rows) {
      const days = kvkkDaysLeft(r.dueAt, now);
      const today = now.toISOString().slice(0, 10);
      if (days > 7 || r.lastReminderOn === today) continue;
      await this.ds.manager.update(DsrRequestEntity, { id: r.id }, { lastReminderOn: today });
      this.gateway.emitToCompanyAdmins(r.companyId, 'kvkk_dsr_due', { requestNo: r.requestNo, daysLeft: days, overdue: days < 0 });
      sent++;
    }
    return sent;
  }
}
