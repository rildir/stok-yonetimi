import { HttpException, HttpStatus } from '@nestjs/common';
import { MessageParams } from './messages';

export interface CodedErrorBody {
  code: string;
  params?: MessageParams;
  /** Fallback (the code itself) for consumers that bypass the filter. */
  message: string;
}

/**
 * Body for a coded error; pass it to any Nest HttpException, e.g.
 * `throw new BadRequestException(err('USERNAME_TAKEN', { username }))`.
 * The global I18nExceptionFilter localizes it according to Accept-Language.
 */
export function err(code: string, params?: MessageParams): CodedErrorBody {
  return params ? { code, params, message: code } : { code, message: code };
}

export class AppException extends HttpException {
  constructor(status: HttpStatus, code: string, params?: MessageParams) {
    super(err(code, params), status);
  }
}

export function isCodedErrorBody(body: unknown): body is CodedErrorBody {
  return typeof body === 'object' && body !== null && typeof (body as any).code === 'string';
}
