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
  const hasToken = typeof window !== 'undefined' ? !!localStorage.getItem('smart_inventory_token') : false;
  if (!hasToken) {
    return true;
  }
  return router.parseUrl('/dashboard');
};
