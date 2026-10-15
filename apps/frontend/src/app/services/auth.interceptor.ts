import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { I18nService } from '../i18n/i18n.service';
import { catchError, retry, throwError, timer } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const i18n = inject(I18nService);
  req = req.clone({ setHeaders: { 'Accept-Language': i18n.lang() } });
  // Extract token from localStorage (safe check for SSR)
  const token = typeof window !== 'undefined' ? localStorage.getItem('smart_inventory_token') : null;
  
  if (token && !req.url.includes('/auth/login')) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }
  
  return next(req).pipe(
    retry({
      count: 2,
      delay: (error: HttpErrorResponse, retryCount: number) => {
        // Retry only GET requests or 5xx server errors / network connection loss
        if ((req.method === 'GET' && error.status !== 403 && error.status !== 422) || error.status === 0 || error.status >= 500) {
          return timer(retryCount * 1000);
        }
        throw error;
      }
    }),
    catchError((error: HttpErrorResponse) => {
      // Admin-issued temporary password: everything except the change is refused.
      if (error.status === 403 && (error.error as { code?: string } | null)?.code === 'PASSWORD_CHANGE_REQUIRED') {
        router.navigate(['/change-password']);
        return throwError(() => error);
      }
      if (error.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('smart_inventory_token');
        }
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
