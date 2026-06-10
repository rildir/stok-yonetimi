import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';

export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  // SSR check if window is available
  const isLoggedIn = typeof window !== 'undefined' ? localStorage.getItem('isLoggedIn') === 'true' : false;
  if (isLoggedIn) {
    return true;
  }
  return router.parseUrl('/login');
};

export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  const isLoggedIn = typeof window !== 'undefined' ? localStorage.getItem('isLoggedIn') === 'true' : false;
  if (!isLoggedIn) {
    return true;
  }
  return router.parseUrl('/dashboard');
};
