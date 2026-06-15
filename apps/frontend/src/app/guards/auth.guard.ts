import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  const hasToken = typeof window !== 'undefined' ? !!localStorage.getItem('smart_inventory_token') : false;
  if (hasToken) {
    return true;
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
