import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 > Date.now()) {
        return true;
      }
    } catch {
      // Invalid token format
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('smart_inventory_token');
    }
  }
  return router.parseUrl('/login');
};

export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 > Date.now()) {
        return router.parseUrl('/dashboard');
      }
    } catch {
      // Invalid token
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('smart_inventory_token');
    }
  }
  return true;
};

/** Admin-only pages (audit log, integrations). The backend enforces roles too; this keeps non-admins out of the UI. */
export const adminGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role === 'admin') return true;
    } catch {
      // Invalid token
    }
  }
  return router.parseUrl('/dashboard');
};

/**
 * Pages with cost values, tax pre-reports or customer trace data (disposal files): administrators
 * and managers only. The backend enforces the same roles.
 */
export const staffGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role === 'admin' || payload.role === 'manager') return true;
    } catch {
      // Invalid token
    }
  }
  return router.parseUrl('/dashboard');
};
