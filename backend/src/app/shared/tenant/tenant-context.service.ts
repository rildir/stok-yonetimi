import { err } from '../i18n/app-error';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  companyId?: string;
  username?: string;
  userId?: string;
  apiKeyId?: string;
  ip?: string;
  userAgent?: string;
}

/** Who is acting in the current request (for audit logging). */
export interface ActorInfo {
  companyId?: string;
  username?: string;
  userId?: string;
  apiKeyId?: string;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<TenantStore>();

/**
 * Request-scoped tenant context backed by AsyncLocalStorage.
 *
 * - `tenantContextMiddleware` opens an empty store for every HTTP request.
 * - `AuthGuard` fills in the authenticated user's companyId.
 * - Services read `tenant.companyId` to scope every query / insert.
 *
 * Reading `companyId` outside of an authenticated context throws, so a
 * forgotten scope fails loudly instead of leaking data across tenants.
 */
@Injectable()
export class TenantContext {
  /** Express middleware: give each request its own store. */
  static middleware(req: any, _res: unknown, next: () => void): void {
    const fwd = req?.headers?.['x-forwarded-for'];
    const ip = (typeof fwd === 'string' && fwd.split(',')[0].trim()) || req?.ip || req?.socket?.remoteAddress;
    const ua = req?.headers?.['user-agent'];
    storage.run({ ip: ip ? String(ip).slice(0, 64) : undefined, userAgent: ua ? String(ua).slice(0, 255) : undefined }, next);
  }

  /** Attach actor details (user id / API key) after authentication. */
  setActor(actor: { userId?: string; apiKeyId?: string; username?: string }): void {
    const store = storage.getStore();
    if (store) Object.assign(store, actor);
  }

  /** Snapshot of the current actor; empty outside a request. */
  get actor(): ActorInfo {
    return TenantContext.current();
  }

  /** Static accessor for code outside Nest DI (TypeORM subscribers). */
  static current(): ActorInfo {
    return { ...(storage.getStore() || {}) };
  }

  /** Called by AuthGuard once the user is authenticated. */
  set(companyId: string, username?: string): void {
    const store = storage.getStore();
    if (store) {
      store.companyId = companyId;
      store.username = username;
    } else {
      storage.enterWith({ companyId, username });
    }
  }

  get companyId(): string {
    const companyId = storage.getStore()?.companyId;
    if (!companyId) {
      throw new UnauthorizedException(err('TENANT_CONTEXT_MISSING'));
    }
    return companyId;
  }

  get hasCompany(): boolean {
    return !!storage.getStore()?.companyId;
  }

  /** Run code (seeders, background jobs, tests) inside an explicit tenant. */
  run<T>(companyId: string, fn: () => T): T {
    return storage.run({ companyId }, fn);
  }
}
