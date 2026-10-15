import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { EDocumentRegistryCacheEntity } from '../../entities/ebelge.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { ProviderError, RegistryDocType } from '../../shared/ebelge/provider';
import { EBelgeSettingsService } from './ebelge-settings.service';

export interface RegistryAnswer {
  taxId: string;
  docType: RegistryDocType;
  registered: boolean;
  aliases: string[];
  checkedAt: Date;
  cached: boolean;
}

/**
 * GİB registered-user list (kayıtlı kullanıcı listesi) through the integrator: e-Fatura and
 * e-İrsaliye separately (509 IV.1.1, V.5.3). Answers are cached per company for
 * registryCacheHours (default 24) and re-checked right before an invoice / despatch is issued.
 */
@Injectable()
export class RegistryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenant: TenantContext,
    private readonly settings: EBelgeSettingsService,
  ) {}

  async check(taxId: string, docType: RegistryDocType, opts: { force?: boolean; manager?: EntityManager } = {}): Promise<RegistryAnswer> {
    const m = opts.manager || this.dataSource.manager;
    const companyId = this.tenant.companyId;
    const id = String(taxId || '').trim();
    const cached = await m.findOne(EDocumentRegistryCacheEntity, { where: { companyId, taxId: id, docType } });
    const r = await this.settings.resolve(companyId, m);
    const maxAge = (r.settings.registryCacheHours ?? 24) * 3600_000;
    if (cached && !opts.force && Date.now() - new Date(cached.checkedAt).getTime() < maxAge) {
      return { taxId: id, docType, registered: cached.registered, aliases: cached.aliases || [], checkedAt: new Date(cached.checkedAt), cached: true };
    }
    let answer: { registered: boolean; aliases: string[]; title?: string | null };
    try {
      answer = await r.provider.checkUser(r.ctx, id, docType);
    } catch (e) {
      if (e instanceof ProviderError && e.code === 'UNAVAILABLE') await this.settings.markOutage(companyId, e.message);
      throw new ServiceUnavailableException(err('RECIPIENT_REGISTRY_CHECK_FAILED', { message: (e as Error).message }));
    }
    const checkedAt = new Date();
    if (cached) {
      await m.update(EDocumentRegistryCacheEntity, { id: cached.id }, { registered: answer.registered, aliases: answer.aliases, title: answer.title ?? null, checkedAt });
    } else {
      await m.createQueryBuilder().insert().into(EDocumentRegistryCacheEntity).values({ companyId, taxId: id, docType, registered: answer.registered, aliases: answer.aliases, title: answer.title ?? null, checkedAt }).orIgnore().execute();
    }
    // Keep the customer cards in step (badge "e-Fatura mükellefi").
    const patch = docType === 'INVOICE' ? { eInvoiceRegistered: answer.registered, eInvoiceAliases: answer.aliases, eInvoiceCheckedAt: checkedAt } : { eDespatchRegistered: answer.registered, eDespatchAliases: answer.aliases };
    await m.update(CustomerEntity, { companyId, identityNumber: id }, patch);
    return { taxId: id, docType, registered: answer.registered, aliases: answer.aliases, checkedAt, cached: false };
  }

  /** "Sorgula" on the customer card: both registries, fresh. */
  async checkCustomer(customerId: string) {
    const c = await this.dataSource.manager.findOne(CustomerEntity, { where: { companyId: this.tenant.companyId, id: customerId } });
    if (!c) throw new NotFoundException(err('CUSTOMER_NOT_FOUND'));
    const taxId = String(c.identityNumber || '');
    if (!/^(\d{10}|\d{11})$/.test(taxId) || !['VKN', 'TCKN', 'YKN'].includes(String(c.identityType))) {
      return { customerId, taxId: taxId || null, eInvoice: null, eDespatch: null, reason: 'NO_TAX_ID' };
    }
    const eInvoice = await this.check(taxId, 'INVOICE', { force: true });
    const eDespatch = await this.check(taxId, 'DESPATCH', { force: true });
    return { customerId, taxId, eInvoice, eDespatch };
  }
}
