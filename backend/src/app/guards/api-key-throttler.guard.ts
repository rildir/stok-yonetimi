import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { parseApiKey } from '../shared/integrations/api-key';
import { extractApiKey } from './auth.guard';

/** Requests per minute for one API key. */
export function apiKeyRateLimit(): number {
  return Number(process.env.API_KEY_RATE_LIMIT) || 120;
}

/**
 * Requests per minute per IP for browser / JWT traffic. A single page load fans out into many
 * API calls, so 60 was hit by one user navigating quickly; login brute force is covered by lockout.
 */
export function browserRateLimit(): number {
  return Number(process.env.BROWSER_RATE_LIMIT) || 600;
}

export function throttleLimit(context: ExecutionContext): number {
  const req = context.switchToHttp().getRequest();
  return extractApiKey(req) ? apiKeyRateLimit() : browserRateLimit();
}

/** Throttles per API key (by its public prefix) instead of per IP when a key is presented. */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, any>): Promise<string> {
    const parsed = parseApiKey(extractApiKey(req));
    if (parsed) return `apikey:${parsed.prefix}`;
    return super.getTracker(req);
  }
}
