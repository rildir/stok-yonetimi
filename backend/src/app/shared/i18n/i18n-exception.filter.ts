import { STATUS_CODES } from 'http';
import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ValidationError,
} from '@nestjs/common';
import { isCodedErrorBody } from './app-error';
import { Lang, MessageParams, resolveLang, translate } from './messages';
import { TRIGGER_ERROR_CODES } from '../inventory/immutability-triggers';

/**
 * Error code raised by an immutability trigger (SIGNAL SQLSTATE '45000'), if `exception`
 * is such a database error; it is answered as 409 Conflict instead of 500.
 */
export function triggerErrorCode(exception: unknown): string | null {
  const e = exception as { driverError?: { sqlState?: string; sqlMessage?: string }; sqlState?: string; sqlMessage?: string; message?: string };
  const state = e?.driverError?.sqlState ?? e?.sqlState;
  const msg = e?.driverError?.sqlMessage ?? e?.sqlMessage ?? e?.message ?? '';
  if (state !== '45000') return null;
  return TRIGGER_ERROR_CODES.find((c) => msg.includes(c)) ?? null;
}

interface ValidationIssue {
  code: string;
  params: MessageParams;
}

/** Collect (code, params) per failed constraint, recursing into nested DTOs. */
function flattenValidationErrors(errors: ValidationError[], parent = ''): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const e of errors) {
    const property = parent ? `${parent}.${e.property}` : e.property;
    for (const message of Object.values(e.constraints || {})) {
      const { code, params } = parseValidationMessage(message);
      // A rule may report on another property than the one it is attached to (`field=`).
      const field = params['field'] ? (parent ? `${parent}.${params['field']}` : String(params['field'])) : property;
      issues.push({ code, params: { ...params, property: field, value: e.value as any } });
    }
    if (e.children?.length) issues.push(...flattenValidationErrors(e.children, property));
  }
  return issues;
}

/**
 * DTO messages may carry constraint params: `CODE|min=6` (built via `vmsg('CODE', 'min')`,
 * which class-validator expands from `$constraint1`).
 */
export function parseValidationMessage(message: string): ValidationIssue {
  const [code, ...pairs] = String(message).split('|');
  const params: MessageParams = {};
  for (const pair of pairs) {
    const idx = pair.indexOf('=');
    if (idx > 0) params[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return { code, params };
}

/** Build a class-validator message code; named params map to $constraint1, $constraint2... */
export function vmsg(code: string, ...constraintNames: string[]): string {
  return [code, ...constraintNames.map((n, i) => `${n}=$constraint${i + 1}`)].join('|');
}

/**
 * Domain error codes that are reported as the top-level `code` of a validation
 * error, so clients get the same code (e.g. INVALID_VKN, WEAK_PASSWORD) whether the
 * check ran in a DTO (create) or in a service (update).
 */
export const PROMOTED_VALIDATION_CODES = new Set([
  'INVALID_VKN',
  'INVALID_TCKN',
  'TAX_ID_REQUIRED_FOR_COMPANY',
  'INVALID_IDENTITY_TYPE',
  'INVALID_MERSIS',
  'INVALID_KEP_ADDRESS',
  'INVALID_POSTAL_CODE',
  'INVALID_PROVINCE',
  'INVALID_DISTRICT',
  'INVALID_TAX_OFFICE',
  'INVALID_BOOKKEEPING_TYPE',
  'INVALID_WEBSITE',
  'INVALID_DOCUMENT_SERIES',
  'WEAK_PASSWORD',
  'REASON_CODE_REQUIRED',
  'REASON_CODE_INVALID',
  'QUANTITY_INVALID',
  'VALIDATION_QUANTITY_DECIMAL',
  'DOCUMENT_DATE_INVALID',
  'DOCUMENT_TYPE_INVALID',
  'UNECE_CODE_INVALID',
  'UNIT_DECIMALS_INVALID',
  'WAREHOUSE_TYPE_INVALID',
  'WAREHOUSE_OWNERSHIP_INVALID',
  'REGULATORY_CATEGORY_INVALID',
  'INVENTORY_CLASS_INVALID',
  'COMPLIANCE_MODULE_INVALID',
  'REVERSAL_NOTE_REQUIRED',
]);

/** ValidationPipe exceptionFactory: keeps codes + constraint params for later localization. */
export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_FAILED', validation: flattenValidationErrors(errors) });
}

@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(I18nExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      throw exception;
    }
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const lang = resolveLang(request?.headers?.['accept-language']);

    const triggerCode = triggerErrorCode(exception);
    const status = triggerCode ? HttpStatus.CONFLICT : exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const body: LocalizedErrorBody = triggerCode
      ? { statusCode: status, code: triggerCode, message: translate(triggerCode, lang), error: 'Conflict' }
      : buildErrorBody(exception, status, lang);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`HTTP ${status} ${request?.method} ${request?.url}: ${exception}`, (exception as Error)?.stack);
    } else {
      this.logger.warn(`HTTP ${status} ${request?.method} ${request?.url}: ${body.code ?? ''} ${body.message}`);
    }

    response.status(status).json({ ...body, timestamp: new Date().toISOString(), path: request?.url });
  }
}

export interface LocalizedErrorBody {
  statusCode: number;
  code?: string;
  message: string;
  error?: string;
  errors?: string[];
  /** Validation errors: failing property and code per issue. */
  fields?: { property: string; code: string }[];
}

export function buildErrorBody(exception: unknown, status: number, lang: Lang): LocalizedErrorBody {
  if (!(exception instanceof HttpException)) {
    return { statusCode: status, code: 'INTERNAL_ERROR', message: translate('INTERNAL_ERROR', lang) };
  }
  const res = exception.getResponse() as any;
  const error: string | undefined = (typeof res === 'object' && res?.error) || STATUS_CODES[status];

  // Validation errors from validationExceptionFactory
  if (res && Array.isArray(res.validation)) {
    const issues = res.validation as ValidationIssue[];
    const errors: string[] = issues.map((i) => translate(i.code, lang, i.params));
    const fields = issues.map((i) => ({ property: String(i.params['property'] ?? ''), code: i.code }));
    const code = issues.find((i) => PROMOTED_VALIDATION_CODES.has(i.code))?.code ?? 'VALIDATION_FAILED';
    return { statusCode: status, code, message: errors.join(' '), errors, fields, error: 'Bad Request' };
  }
  if (isCodedErrorBody(res)) {
    return { statusCode: status, code: res.code, message: translate(res.code, lang, res.params), ...(error ? { error } : {}) };
  }
  // Plain Nest exceptions: message may be a string, array or missing — pass through (translating known codes).
  const raw = typeof res === 'string' ? res : res?.message ?? exception.message;
  const errors = Array.isArray(raw) ? raw.map((m) => translate(String(m), lang)) : undefined;
  const message = errors ? errors.join(' ') : translate(String(raw), lang);
  return { statusCode: status, message, ...(error ? { error } : {}), ...(errors ? { errors } : {}) };
}
