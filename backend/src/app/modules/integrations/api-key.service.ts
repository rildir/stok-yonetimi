import { err } from '../../shared/i18n/app-error';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKeyEntity } from '../../entities/api-key.entity';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { generateApiKey, parseApiKey, sanitizeScopes, verifySecret } from '../../shared/integrations/api-key';

export interface CreateApiKeyInput {
  name: string;
  scopes: Record<string, string>;
  expiresAt?: string | null;
}

/** Throttle lastUsedAt writes to at most one per minute per key. */
const LAST_USED_WRITE_MS = 60_000;

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKeyEntity) private readonly repo: Repository<ApiKeyEntity>,
    private readonly tenant: TenantContext,
  ) {}

  present(k: ApiKeyEntity) {
    const { secretHash, ...rest } = k;
    return rest;
  }

  async list() {
    const rows = await this.repo.find({ where: { companyId: this.tenant.companyId }, order: { createdAt: 'DESC' } });
    return rows.map((r) => this.present(r));
  }

  async create(input: CreateApiKeyInput, createdBy: string) {
    const scopes = sanitizeScopes(input.scopes);
    if (!Object.keys(scopes).length) throw new BadRequestException(err('API_KEY_SCOPES_REQUIRED'));
    let expiresAt: Date | null = null;
    if (input.expiresAt) {
      expiresAt = new Date(input.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException(err('API_KEY_EXPIRY_INVALID'));
      }
    }
    const gen = generateApiKey();
    const saved = await this.repo.save(
      this.repo.create({
        companyId: this.tenant.companyId,
        name: input.name.trim(),
        prefix: gen.prefix,
        secretHash: gen.secretHash,
        scopes,
        expiresAt,
        revoked: false,
        createdBy,
        lastUsedAt: null,
      }),
    );
    return { ...this.present(saved), secret: gen.key };
  }

  async revoke(id: string) {
    const key = await this.repo.findOne({ where: { id, companyId: this.tenant.companyId } });
    if (!key) throw new NotFoundException(err('API_KEY_NOT_FOUND'));
    key.revoked = true;
    return this.present(await this.repo.save(key));
  }

  /** Resolve a raw key (no tenant context yet). Returns null when invalid, revoked or expired. */
  async authenticate(raw: string): Promise<ApiKeyEntity | null> {
    const parsed = parseApiKey(raw);
    if (!parsed) return null;
    const key = await this.repo.findOne({ where: { prefix: parsed.prefix } });
    if (!key || !verifySecret(parsed.secret, key.secretHash)) return null;
    if (key.revoked) return null;
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null;
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > LAST_USED_WRITE_MS) {
      key.lastUsedAt = new Date();
      await this.repo.update({ id: key.id }, { lastUsedAt: key.lastUsedAt });
    }
    return key;
  }
}
