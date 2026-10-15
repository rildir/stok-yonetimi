import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { ConsentEntity } from '../../entities/kvkk.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';

/**
 * Explicit consent records (açık rıza, KVKK md. 5/1, R60). Only purposes whose legal basis really
 * is consent can be recorded; invoicing, despatch and delivery rely on the contract / legal
 * obligation (md. 5/2-c, ç) and are refused with CONSENT_NOT_REQUIRED. Nothing is pre-ticked: a
 * record exists only after an explicit act, with channel, text version and evidence.
 */
export const CONSENT_PURPOSES = ['MARKETING_EMAIL', 'MARKETING_SMS', 'MARKETING_CALL', 'PROFILING', 'CROSS_BORDER_TRANSFER', 'SPECIAL_CATEGORY'] as const;
/** Purposes that never need consent (legal basis is the contract or a legal obligation). */
export const NO_CONSENT_PURPOSES = ['INVOICING', 'DESPATCH', 'DELIVERY', 'ORDER_PROCESSING', 'ACCOUNTING', 'E_DOCUMENT'];
export const CONSENT_CHANNELS = ['WEB', 'PAPER', 'EMAIL', 'SMS', 'PHONE', 'IN_PERSON', 'KEP'];

export interface ConsentInput {
  subjectType: string;
  subjectId: string;
  purposeCode: string;
  channel: string;
  textVersion?: string | null;
  givenAt?: string | null;
  evidence?: string | null;
}

@Injectable()
export class ConsentService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly tenant: TenantContext) {}

  private get companyId() {
    return this.tenant.companyId;
  }

  purposes() {
    return { purposes: CONSENT_PURPOSES, notRequired: NO_CONSENT_PURPOSES, channels: CONSENT_CHANNELS };
  }

  private async assertSubject(type: string, id: string) {
    const repo = type === 'CUSTOMER' ? CustomerEntity : type === 'SUPPLIER' ? SupplierEntity : null;
    if (!repo) throw new BadRequestException(err('SUBJECT_TYPE_INVALID'));
    const ok = await this.ds.manager.exists(repo as any, { where: { id, companyId: this.companyId } });
    if (!ok) throw new NotFoundException(err(type === 'CUSTOMER' ? 'CUSTOMER_NOT_FOUND' : 'SUPPLIER_NOT_FOUND'));
  }

  async list(subjectType?: string, subjectId?: string) {
    const where: Record<string, unknown> = { companyId: this.companyId };
    if (subjectType) where['subjectType'] = subjectType;
    if (subjectId) where['subjectId'] = subjectId;
    return this.ds.manager.find(ConsentEntity, { where, order: { givenAt: 'DESC' }, take: 500 });
  }

  async give(input: ConsentInput, username: string) {
    if (NO_CONSENT_PURPOSES.includes(input.purposeCode)) throw new BadRequestException(err('CONSENT_NOT_REQUIRED', { purpose: input.purposeCode }));
    if (!(CONSENT_PURPOSES as readonly string[]).includes(input.purposeCode)) throw new BadRequestException(err('CONSENT_PURPOSE_INVALID'));
    if (!CONSENT_CHANNELS.includes(input.channel)) throw new BadRequestException(err('VALIDATION_FAILED'));
    await this.assertSubject(input.subjectType, input.subjectId);
    const active = await this.ds.manager.findOne(ConsentEntity, { where: { companyId: this.companyId, subjectType: input.subjectType, subjectId: input.subjectId, purposeCode: input.purposeCode, withdrawnAt: IsNull() } });
    if (active) return active;
    return this.ds.manager.save(
      ConsentEntity,
      this.ds.manager.create(ConsentEntity, {
        companyId: this.companyId,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        purposeCode: input.purposeCode,
        channel: input.channel,
        textVersion: input.textVersion || null,
        givenAt: input.givenAt ? new Date(input.givenAt) : new Date(),
        evidence: input.evidence || null,
        recordedBy: username,
      }),
    );
  }

  /** Withdrawal is always possible and as easy as giving (KVKK md. 5; Rehber). */
  async withdraw(id: string, channel: string | undefined) {
    const c = await this.ds.manager.findOne(ConsentEntity, { where: { id, companyId: this.companyId } });
    if (!c) throw new NotFoundException(err('CONSENT_NOT_FOUND'));
    if (c.withdrawnAt) throw new BadRequestException(err('CONSENT_ALREADY_WITHDRAWN'));
    c.withdrawnAt = new Date();
    c.withdrawnChannel = channel && CONSENT_CHANNELS.includes(channel) ? channel : 'WEB';
    return this.ds.manager.save(ConsentEntity, c);
  }
}
