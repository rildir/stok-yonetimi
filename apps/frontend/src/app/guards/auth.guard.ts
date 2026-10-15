import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map } from 'rxjs';
import { SessionService } from '../services/session.service';

/**
 * Signed-in pages. WP7: the access token is short-lived; an expired one is renewed through the
 * httpOnly refresh cookie before falling back to the login page.
 */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const session = inject(SessionService);
  if (SessionService.tokenValid(SessionService.token())) return true;
  if (typeof window === 'undefined') return router.parseUrl('/login');
  return session.refresh().pipe(map((t) => (t ? true : (session.clearToken(), router.parseUrl('/login')))));
};

export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  const session = inject(SessionService);
  if (SessionService.tokenValid(SessionService.token())) return router.parseUrl('/dashboard');
  if (typeof window === 'undefined') return true;
  // A live refresh session (cookie) goes straight to the dashboard.
  return session.refresh().pipe(map((t) => (t ? router.parseUrl('/dashboard') : true)));
};

const roleOf = () => SessionService.payload()?.['role'] as string | undefined;

/** Admin-only pages (integrations). The backend enforces roles too; this keeps non-admins out of the UI. */
export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  return roleOf() === 'admin' ? true : router.parseUrl('/dashboard');
};

/** Audit log: administrators and the read-only auditor (denetçi). */
export const auditGuard: CanActivateFn = () => {
  const router = inject(Router);
  const role = roleOf();
  return role === 'admin' || role === 'auditor' ? true : router.parseUrl('/dashboard');
};

/**
 * Pages with cost values, tax pre-reports or customer trace data (disposal files): administrators
 * and managers only. The backend enforces the same roles.
 */
export const staffGuard: CanActivateFn = () => {
  const router = inject(Router);
  const role = roleOf();
  return role === 'admin' || role === 'manager' || role === 'auditor' ? true : router.parseUrl('/dashboard');
};
