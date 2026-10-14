import { err } from '../i18n/app-error';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  companyId?: string;
  username?: string;
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
  static middleware(_req: unknown, _res: unknown, next: () => void): void {
    storage.run({}, next);
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
