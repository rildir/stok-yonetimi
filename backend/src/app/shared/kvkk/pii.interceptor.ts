import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { maskPersonalIdentifiers } from './masking';

/**
 * Global response filter (R61): callers without `customers.pii.read` (viewer, auditor, API keys
 * without the customers_pii scope) never receive a natural person's identity number (TCKN / YKN)
 * or passport number in clear text - in customers, orders, documents, traces or any other JSON
 * response. Text responses (CSV exports, printable legal documents) are produced by their own
 * permission-aware code paths.
 */
@Injectable()
export class PiiMaskingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    const canRead = !!user?.permissions?.includes('customers.pii.read');
    if (!user || canRead) return next.handle();
    return next.handle().pipe(
      map((body) => {
        if (body === null || body === undefined || typeof body !== 'object' || Buffer.isBuffer(body)) return body;
        if (typeof (body as { pipe?: unknown }).pipe === 'function' || (body as { getStream?: unknown }).getStream) return body;
        return maskPersonalIdentifiers(JSON.parse(JSON.stringify(body)));
      }),
    );
  }
}
