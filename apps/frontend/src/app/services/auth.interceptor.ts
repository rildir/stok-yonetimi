import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { I18nService } from '../i18n/i18n.service';
import { catchError, retry, switchMap, throwError, timer } from 'rxjs';
import { SessionService } from './session.service';

const withToken = (req: HttpRequest<unknown>, token: string | null) => (token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const i18n = inject(I18nService);
  const session = inject(SessionService);
  req = req.clone({ setHeaders: { 'Accept-Language': i18n.lang() } });
  const isAuthCall = /\/auth\/(login|refresh|logout|register|accept-invite)/.test(req.url);
  // Sign-in, registration and invitation set the httpOnly refresh cookie (cross-origin in development).
  if (isAuthCall) req = req.clone({ withCredentials: true });
  const token = SessionService.token();
  const authed = !isAuthCall ? withToken(req, token) : req;

  return next(authed).pipe(
    retry({
      count: 2,
      delay: (error: HttpErrorResponse, retryCount: number) => {
        // Retry only GET requests or 5xx server errors / network connection loss
        if ((req.method === 'GET' && error.status !== 401 && error.status !== 403 && error.status !== 422 && error.status !== 404) || error.status === 0 || error.status >= 500) {
          return timer(retryCount * 1000);
        }
        throw error;
      },
    }),
    catchError((error: HttpErrorResponse) => {
      const code = (error.error as { code?: string } | null)?.code;
      // Admin-issued temporary password: everything except the change is refused.
      if (error.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
        router.navigate(['/change-password']);
        return throwError(() => error);
      }
      // WP7: administrators must set up 2FA (grace period over).
      if (error.status === 403 && code === 'TOTP_REQUIRED') {
        router.navigate(['/settings'], { queryParams: { tab: 'profile' } });
        return throwError(() => error);
      }
      if (error.status === 401 && !isAuthCall) {
        // WP7: short-lived access token - renew once through the refresh cookie, then retry.
        return session.refresh().pipe(
          switchMap((fresh) => {
            if (fresh) return next(withToken(req, fresh));
            session.clearToken();
            router.navigate(['/login']);
            return throwError(() => error);
          }),
        );
      }
      return throwError(() => error);
    }),
  );
};
