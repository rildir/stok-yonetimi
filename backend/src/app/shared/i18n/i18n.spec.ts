import { BadRequestException, HttpStatus, NotFoundException, ValidationError } from '@nestjs/common';
import { AppException, err } from './app-error';
import { buildErrorBody, I18nExceptionFilter, parseValidationMessage, validationExceptionFactory, vmsg } from './i18n-exception.filter';
import { MESSAGES, resolveLang, translate } from './messages';

describe('i18n catalog', () => {
  it('has tr and en for every code', () => {
    for (const [code, entry] of Object.entries(MESSAGES)) {
      expect(entry.tr).toBeTruthy();
      expect(entry.en).toBeTruthy();
      const tokens = (s: string) => (s.match(/\{\w+\}/g) || []).sort();
      expect({ code, tokens: tokens(entry.en) }).toEqual({ code, tokens: tokens(entry.tr) });
    }
  });

  it('resolves language from Accept-Language', () => {
    expect(resolveLang(undefined)).toBe('tr');
    expect(resolveLang('en-US,en;q=0.9')).toBe('en');
    expect(resolveLang('tr')).toBe('tr');
    expect(resolveLang('de')).toBe('tr');
  });

  it('interpolates params and passes unknown messages through', () => {
    expect(translate('USERNAME_TAKEN', 'en', { username: 'ali' })).toBe('Username "ali" is already taken.');
    expect(translate('USERNAME_TAKEN', 'tr', { username: 'ali' })).toBe('"ali" kullanıcı adı zaten kullanımda.');
    expect(translate('some raw message', 'en')).toBe('some raw message');
  });
});

describe('error body building', () => {
  it('localizes coded exceptions', () => {
    const ex = new BadRequestException(err('AUTH_INVALID_CREDENTIALS'));
    expect(buildErrorBody(ex, 400, 'en')).toEqual({
      statusCode: 400, code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid username or password. After repeated failed attempts the account is locked for a while.', error: 'Bad Request',
    });
    expect(buildErrorBody(ex, 400, 'tr').message).toBe('Kullanıcı adı veya şifre hatalı. Art arda hatalı denemelerden sonra hesap bir süre kilitlenir.');
  });

  it('supports AppException', () => {
    const ex = new AppException(HttpStatus.NOT_FOUND, 'PRODUCT_NOT_FOUND_ID', { id: 7 });
    expect(ex.getStatus()).toBe(404);
    expect(buildErrorBody(ex, 404, 'en')).toMatchObject({ code: 'PRODUCT_NOT_FOUND_ID', message: 'Product not found: ID 7' });
  });

  it('passes plain messages through', () => {
    expect(buildErrorBody(new NotFoundException('Cannot GET /x'), 404, 'en').message).toBe('Cannot GET /x');
    expect(buildErrorBody(new Error('boom'), 500, 'en')).toMatchObject({ code: 'INTERNAL_ERROR', message: 'Internal server error.' });
  });

  it('translates validation errors with constraint params into a string message', () => {
    const msg = vmsg('VALIDATION_PASSWORD_MIN', 'min').replace('$constraint1', '6');
    expect(parseValidationMessage(msg)).toEqual({ code: 'VALIDATION_PASSWORD_MIN', params: { min: '6' } });
    const errors: ValidationError[] = [
      { property: 'password', constraints: { minLength: msg }, children: [] } as ValidationError,
      { property: 'username', constraints: { isNotEmpty: 'VALIDATION_USERNAME_REQUIRED' }, children: [] } as ValidationError,
      { property: 'extra', constraints: { whitelistValidation: 'property extra should not exist' }, children: [] } as ValidationError,
    ];
    const body = buildErrorBody(validationExceptionFactory(errors), 400, 'en');
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.errors).toEqual(['Password must be at least 6 characters.', 'Username is required.', 'Field "extra" is not allowed.']);
    expect(typeof body.message).toBe('string');
  });

  it('never shows class-validator English text: generic codes, dropped when a specific code exists', () => {
    const errors: ValidationError[] = [
      {
        property: 'note',
        value: undefined,
        constraints: { isNotEmpty: 'REVERSAL_NOTE_REQUIRED', isString: 'note must be a string', maxLength: 'note must be shorter than or equal to 255 characters' },
        children: [],
      } as ValidationError,
      { property: 'memo', value: 'x'.repeat(300), constraints: { maxLength: 'memo must be shorter than or equal to 255 characters' }, children: [] } as ValidationError,
      { property: 'documentType', value: 'ZZZ', constraints: { isIn: 'DOCUMENT_TYPE_INVALID' }, children: [] } as ValidationError,
    ];
    const tr = buildErrorBody(validationExceptionFactory(errors), 400, 'tr');
    expect(tr.errors).toEqual(['Ters kayıt için açıklama zorunludur.', '"memo" alanı en fazla 255 karakter olabilir.', 'Geçersiz belge türü: ZZZ']);
    expect(tr.code).toBe('REVERSAL_NOTE_REQUIRED');
  });

  it('filter writes localized JSON using Accept-Language', () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host: any = {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => ({ status }),
        getRequest: () => ({ url: '/api/auth/login', method: 'POST', headers: { 'accept-language': 'en' } }),
      }),
    };
    new I18nExceptionFilter().catch(new BadRequestException(err('AUTH_INVALID_CREDENTIALS')), host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0]).toMatchObject({ statusCode: 400, code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid username or password. After repeated failed attempts the account is locked for a while.' });
  });
});
