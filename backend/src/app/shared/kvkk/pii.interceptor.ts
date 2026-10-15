import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { maskPersonalIdentifiers, maskPersonalIdsInText, stripInternalKeys } from './masking';

/**
 * Global response filter (R61): callers without `customers.pii.read` (viewer, auditor, API keys
 * without the customers_pii scope) never receive a natural person's identity number (TCKN / YKN)
 * or passport number in clear text - in customers, orders, documents, traces or any other JSON
 * response, and in text responses returned by a handler (printable HTML documents: every valid
 * TCKN in the text is masked). Responses written directly to the socket (@Res: e-document XML /
 * PDF) mask through `callerCanReadPii` in their controllers; CSV exports have their own
 * permission-aware columns.
 */
@Injectable()
export class PiiMaskingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    if (!user || callerCanReadPii(req)) return next.handle();
    return next.handle().pipe(
      map((body) => {
        if (typeof body === 'string') return maskPersonalIdsInText(body);
        if (body === null || body === undefined || typeof body !== 'object' || Buffer.isBuffer(body)) return body;
        if (typeof (body as { pipe?: unknown }).pipe === 'function' || (body as { getStream?: unknown }).getStream) return body;
        return stripInternalKeys(maskPersonalIdentifiers(JSON.parse(JSON.stringify(body))));
      }),
    );
  }
}

/** True when the authenticated caller of `req` may see personal identifiers in clear text. */
export function callerCanReadPii(req: { user?: { permissions?: string[] } } | null | undefined): boolean {
  return !!req?.user?.permissions?.includes('customers.pii.read');
}
