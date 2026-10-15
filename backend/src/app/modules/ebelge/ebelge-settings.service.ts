import { BadRequestException, Injectable, Logger, UnprocessableEntityException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEBelgeSettingsEntity, EDocumentOutboxEntity } from '../../entities/ebelge.entity';
import { CompanyEntity } from '../../entities/company.entity';
import { AuditService } from '../integrations/audit.service';
import { AppGateway } from '../../app.gateway';
import { credentialKeyId, CredentialKeyError, decryptCredentials, encryptCredentials, maskCredentials } from '../../shared/ebelge/credentials';
import { EDocumentProvider, ProviderContext, ProviderError } from '../../shared/ebelge/provider';
import { EARSIV_DELIVERY_CHANNELS, EBELGE_ENVIRONMENTS } from '../../shared/tr';
import { ProviderRegistry } from './provider-registry.service';

export interface EBelgeSettingsInput {
  provider?: string | null;
  environment?: string;
  /** Plain values; a value equal to its mask keeps the stored one */
  credentials?: Record<string, unknown> | null;
  sealDeclarationDate?: string | null;
  senderAlias?: string | null;
  receiverAlias?: string | null;
  earsivDefaultChannel?: string;
  autoSend?: boolean;
  exportEnabled?: boolean;
  sectoralItemIdsEnabled?: boolean;
  registryCacheHours?: number;
  logoDataUri?: string | null;
}

export interface ResolvedProvider {
  settings: CompanyEBelgeSettingsEntity;
  provider: EDocumentProvider;
  ctx: ProviderContext;
  company: CompanyEntity;
}

/** Integrator configuration (Settings > e-Belge sağlayıcısı) and provider resolution per tenant. */
@Injectable()
export class EBelgeSettingsService {
  private readonly logger = new Logger(EBelgeSettingsService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenant: TenantContext,
    private readonly registry: ProviderRegistry,
    private readonly audit: AuditService,
    private readonly gateway: AppGateway,
  ) {}

  async getOrCreate(m: EntityManager = this.dataSource.manager, companyId = this.tenant.companyId): Promise<CompanyEBelgeSettingsEntity> {
    let s = await m.findOne(CompanyEBelgeSettingsEntity, { where: { companyId } });
    if (!s) {
      await m.createQueryBuilder().insert().into(CompanyEBelgeSettingsEntity).values({ companyId, environment: 'TEST' }).orIgnore().execute();
      s = await m.findOneOrFail(CompanyEBelgeSettingsEntity, { where: { companyId } });
    }
    return s;
  }

  /** Settings as shown in the UI: credentials masked, never the encrypted blob. */
  async view() {
    const s = await this.getOrCreate();
    let masked: Record<string, string> = {};
    let credentialsError: string | null = null;
    try {
      masked = maskCredentials(decryptCredentials(s.credentialsEnc, s.companyId));
    } catch (e) {
      credentialsError = (e as Error).message;
    }
    const pending = await this.dataSource.manager.count(EDocumentOutboxEntity, { where: [{ companyId: s.companyId, status: 'PENDING' }, { companyId: s.companyId, status: 'FAILED' }, { companyId: s.companyId, status: 'PROCESSING' }] });
    const { credentialsEnc: _c, ...rest } = s;
    return {
      ...rest,
      credentials: masked,
      hasCredentials: !!s.credentialsEnc,
      credentialsKeyId: credentialKeyId(s.credentialsEnc),
      credentialsError,
      providers: this.registry.list(),
      outboxPending: pending,
    };
  }

  async update(input: EBelgeSettingsInput, user?: string) {
    const s = await this.getOrCreate();
    const before = { provider: s.provider, environment: s.environment, credentialKeys: Object.keys(this.safeDecrypt(s)), autoSend: s.autoSend, exportEnabled: s.exportEnabled };
    if (input.provider !== undefined) {
      if (input.provider && !this.registry.get(input.provider)) throw new BadRequestException(err('EBELGE_PROVIDER_UNKNOWN', { provider: input.provider }));
      s.provider = input.provider || null;
    }
    if (input.environment !== undefined) {
      if (!(EBELGE_ENVIRONMENTS as readonly string[]).includes(input.environment)) throw new BadRequestException(err('VALIDATION_FIELD_IN'));
      s.environment = input.environment;
    }
    if (input.credentials !== undefined) {
      const current = this.safeDecrypt(s);
      const mask = maskCredentials(current);
      const next: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(input.credentials || {})) {
        // Unchanged masked value: keep the stored secret.
        next[k] = typeof v === 'string' && mask[k] !== undefined && v === mask[k] ? current[k] : v;
      }
      try {
        s.credentialsEnc = Object.keys(next).length ? encryptCredentials(next, s.companyId) : null;
      } catch (e) {
        if (e instanceof CredentialKeyError) throw new UnprocessableEntityException(err('EBELGE_CREDENTIALS_KEY_MISSING'));
        throw e;
      }
      s.credentialsKeyId = credentialKeyId(s.credentialsEnc);
    }
    if (input.sealDeclarationDate !== undefined) s.sealDeclarationDate = input.sealDeclarationDate || null;
    if (input.senderAlias !== undefined) s.senderAlias = input.senderAlias || null;
    if (input.receiverAlias !== undefined) s.receiverAlias = input.receiverAlias || null;
    if (input.earsivDefaultChannel !== undefined) {
      if (!(EARSIV_DELIVERY_CHANNELS as readonly string[]).includes(input.earsivDefaultChannel)) throw new BadRequestException(err('VALIDATION_FIELD_IN'));
      s.earsivDefaultChannel = input.earsivDefaultChannel;
    }
    if (input.autoSend !== undefined) s.autoSend = !!input.autoSend;
    if (input.exportEnabled !== undefined) s.exportEnabled = !!input.exportEnabled;
    if (input.sectoralItemIdsEnabled !== undefined) s.sectoralItemIdsEnabled = !!input.sectoralItemIdsEnabled;
    if (input.registryCacheHours !== undefined) s.registryCacheHours = Math.min(168, Math.max(0, Math.round(Number(input.registryCacheHours) || 0)));
    if (input.logoDataUri !== undefined) {
      const logo = input.logoDataUri || null;
      if (logo && (!/^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(logo) || logo.length > 280_000)) throw new BadRequestException(err('EBELGE_LOGO_INVALID'));
      s.logoDataUri = logo;
    }
    // Signing and the legal archive are always the integrator's (509 V.9, VI).
    s.signing = 'PROVIDER';
    s.legalArchive = 'PROVIDER';
    await this.dataSource.manager.save(CompanyEBelgeSettingsEntity, s);
    await this.audit.record({
      companyId: s.companyId,
      action: 'ebelge.settings_updated',
      entityType: 'company_ebelge_settings',
      entityId: s.id,
      before,
      after: { provider: s.provider, environment: s.environment, credentialKeys: Object.keys(this.safeDecrypt(s)), autoSend: s.autoSend, exportEnabled: s.exportEnabled, user: user ?? null },
    });
    return this.view();
  }

  private safeDecrypt(s: CompanyEBelgeSettingsEntity): Record<string, unknown> {
    try {
      return decryptCredentials(s.credentialsEnc, s.companyId);
    } catch {
      return {};
    }
  }

  /** Provider + context of the company; 422 PROVIDER_NOT_CONFIGURED when there is none. */
  async resolve(companyId = this.tenant.companyId, m: EntityManager = this.dataSource.manager): Promise<ResolvedProvider> {
    const settings = await this.getOrCreate(m, companyId);
    const provider = this.registry.get(settings.provider);
    if (!provider) throw new UnprocessableEntityException(err('PROVIDER_NOT_CONFIGURED'));
    const company = await m.findOneOrFail(CompanyEntity, { where: { id: companyId } });
    let credentials: Record<string, unknown>;
    try {
      credentials = decryptCredentials(settings.credentialsEnc, companyId);
    } catch {
      throw new UnprocessableEntityException(err('EBELGE_CREDENTIALS_KEY_MISSING'));
    }
    return {
      settings,
      provider,
      company,
      ctx: { companyId, taxId: company.taxId || '', environment: settings.environment, credentials, senderAlias: settings.senderAlias, receiverAlias: settings.receiverAlias },
    };
  }

  async testConnection(user?: string) {
    const r = await this.resolve();
    let ok = false;
    let message: string | null = null;
    try {
      const res = await r.provider.testConnection(r.ctx);
      ok = res.ok;
      message = res.message ?? null;
    } catch (e) {
      message = e instanceof ProviderError ? `${e.code}: ${e.message}` : (e as Error).message;
    }
    await this.dataSource.manager.update(CompanyEBelgeSettingsEntity, { id: r.settings.id }, { lastConnectionTestAt: new Date(), lastConnectionOk: ok });
    if (ok) await this.markHealthy(r.settings.companyId);
    await this.audit.record({ companyId: r.settings.companyId, action: 'ebelge.connection_test', entityType: 'company_ebelge_settings', entityId: r.settings.id, after: { ok, message, user: user ?? null } });
    return { ok, message, provider: r.provider.name, environment: r.settings.environment };
  }

  /** Provider outage (UNAVAILABLE): banner + 509 V.7 hint until the next successful call. */
  async markOutage(companyId: string, message: string): Promise<void> {
    const s = await this.getOrCreate(this.dataSource.manager, companyId);
    if (!s.outageSince) {
      await this.dataSource.manager.update(CompanyEBelgeSettingsEntity, { id: s.id }, { outageSince: new Date(), lastProviderError: message.slice(0, 500) });
      this.gateway.emitToCompany(companyId, 'ebelge_status', { outage: true, message });
      this.logger.warn(`provider outage for ${companyId}: ${message}`);
    }
  }

  async markHealthy(companyId: string): Promise<void> {
    const s = await this.getOrCreate(this.dataSource.manager, companyId);
    if (s.outageSince) {
      await this.dataSource.manager.update(CompanyEBelgeSettingsEntity, { id: s.id }, { outageSince: null, lastProviderError: null });
      this.gateway.emitToCompany(companyId, 'ebelge_status', { outage: false });
    }
  }
}
