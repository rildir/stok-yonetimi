import { Injectable, NgZone, inject } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay } from 'rxjs';
import { environment } from '../../environments/environment';

export const TOKEN_KEY = 'smart_inventory_token';
/** Inactivity after which the session is closed (the server refuses the refresh after the same time). */
export const IDLE_MINUTES = 30;

/**
 * WP7 session handling: the access token (15-60 min) is renewed through the httpOnly refresh cookie
 * (POST /auth/refresh, credentials included); after IDLE_MINUTES without user activity the session is
 * closed (boşta kalınca oturum kapatma). Uses HttpBackend so the auth interceptor is bypassed.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private http = new HttpClient(inject(HttpBackend));
  private router = inject(Router);
  private zone = inject(NgZone);
  private refreshing$: Observable<string | null> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private lastActivity = Date.now();
  private listening = false;
  /** Set by the layout to show a toast when the idle timeout signs the user out. */
  onIdleLogout: (() => void) | null = null;

  static token(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  static tokenValid(token: string | null): boolean {
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      return !!payload.exp && payload.exp * 1000 > Date.now() + 5000;
    } catch {
      return false;
    }
  }

  static payload(): Record<string, any> | null {
    const t = SessionService.token();
    if (!t) return null;
    try {
      return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch {
      return null;
    }
  }

  setToken(token: string) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* storage unavailable */
    }
  }

  clearToken() {
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  /** One refresh at a time; null when the refresh cookie is missing / expired / idle. */
  refresh(): Observable<string | null> {
    if (typeof window === 'undefined') return of(null);
    if (!this.refreshing$) {
      this.refreshing$ = this.http.post<{ token: string }>(`${environment.apiUrl}/auth/refresh`, {}, { withCredentials: true }).pipe(
        map((r) => {
          this.setToken(r.token);
          return r.token;
        }),
        catchError(() => of(null)),
        finalize(() => (this.refreshing$ = null)),
        shareReplay(1),
      );
    }
    return this.refreshing$;
  }

  /** Revokes the refresh session (cookie) and clears the access token. */
  logout(): void {
    this.stopIdleWatch();
    this.clearToken();
    if (typeof window === 'undefined') return;
    this.http.post(`${environment.apiUrl}/auth/logout`, {}, { withCredentials: true }).subscribe({ error: () => undefined });
  }

  startIdleWatch(): void {
    if (typeof window === 'undefined' || this.listening) return;
    this.listening = true;
    const bump = () => (this.lastActivity = Date.now());
    this.zone.runOutsideAngular(() => {
      for (const ev of ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']) window.addEventListener(ev, bump, { passive: true });
    });
    this.schedule();
  }

  stopIdleWatch(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private schedule() {
    this.stopIdleWatch();
    this.zone.runOutsideAngular(() => {
      this.idleTimer = setTimeout(() => {
        const idleMs = Date.now() - this.lastActivity;
        if (idleMs >= IDLE_MINUTES * 60000 && SessionService.token()) {
          this.zone.run(() => {
            this.logout();
            this.onIdleLogout?.();
            this.router.navigate(['/login']);
          });
          return;
        }
        this.schedule();
      }, 30000);
    });
  }
}
