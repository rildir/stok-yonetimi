import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { parseApiKey } from '../shared/integrations/api-key';
import { extractApiKey } from './auth.guard';

/** Requests per minute for one API key (browser / JWT traffic keeps the per-IP limit of 60). */
export function apiKeyRateLimit(): number {
  return Number(process.env.API_KEY_RATE_LIMIT) || 120;
}

export function throttleLimit(context: ExecutionContext): number {
  const req = context.switchToHttp().getRequest();
  return extractApiKey(req) ? apiKeyRateLimit() : 60;
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
