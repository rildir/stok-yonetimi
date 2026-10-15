import 'reflect-metadata';
import { ArgumentMetadata, BadRequestException, ValidationPipe } from '@nestjs/common';
import { assertSecurityConfig, isLocked, registerFailedLogin, resolveJwtSecret, SecurityConfigError } from './security-config';
import { validationExceptionFactory } from '../i18n/i18n-exception.filter';
import { CreateUserDto, UpdatePasswordDto, AcceptInviteDto } from '../../dto/user.dto';
import { RegisterCompanyDto } from '../../dto/company.dto';
import { CreateCustomerDto } from '../../dto/customer.dto';

describe('JWT secret', () => {
  it('production refuses to start without JWT_SECRET', () => {
    expect(() => assertSecurityConfig({ NODE_ENV: 'production' })).toThrow(SecurityConfigError);
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: '' })).toThrow(SecurityConfigError);
  });
  it('production refuses the old hard-coded default and short secrets', () => {
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'secret_smart_inventory_2026' })).toThrow(SecurityConfigError);
    expect(() => resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(SecurityConfigError);
  });
  it('accepts a proper secret and falls back only outside production', () => {
    expect(resolveJwtSecret({ NODE_ENV: 'production', JWT_SECRET: 'a-very-long-random-secret-123' })).toBe('a-very-long-random-secret-123');
    expect(resolveJwtSecret({ NODE_ENV: 'development' })).toBeTruthy();
  });
});

describe('account lockout', () => {
  const policy = { maxAttempts: 5, lockMinutes: 15 };
  it('locks for 15 minutes after the 5th failure and resets the counter', () => {
    const now = new Date('2026-10-15T10:00:00Z');
    let state = { failedLoginCount: 0, lockedUntil: null as Date | null };
    for (let i = 1; i <= 4; i++) {
      const r = registerFailedLogin(state, now, policy);
      expect(r.locked).toBe(false);
      state = r;
    }
    const r = registerFailedLogin(state, now, policy);
    expect(r.locked).toBe(true);
    expect(r.failedLoginCount).toBe(0);
    expect(r.lockedUntil?.toISOString()).toBe('2026-10-15T10:15:00.000Z');
    expect(isLocked(r, new Date('2026-10-15T10:14:59Z'))).toBe(true);
    expect(isLocked(r, new Date('2026-10-15T10:15:01Z'))).toBe(false);
  });
});

describe('password policy on DTOs (ValidationPipe)', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory });
  const run = async (metatype: any, value: unknown) => {
    try {
      await pipe.transform(value, { type: 'body', metatype } as ArgumentMetadata);
      return [];
    } catch (e) {
      return ((e as BadRequestException).getResponse() as any).validation.map((v: any) => v.code);
    }
  };

  it('rejects 123456 and short passwords everywhere a password is set', async () => {
    expect(await run(CreateUserDto, { username: 'u', role: 'viewer', fullName: 'U', password: '123456' })).toContain('WEAK_PASSWORD');
    expect(await run(UpdatePasswordDto, { currentPassword: 'x', newPassword: 'abc12345' })).toContain('WEAK_PASSWORD');
    expect(await run(AcceptInviteDto, { token: 't', password: 'onlylowercase' })).toContain('WEAK_PASSWORD');
    expect(await run(RegisterCompanyDto, { companyName: 'X', username: 'xx.admin', fullName: 'X', password: 'Acme12345' })).toContain('WEAK_PASSWORD');
  });
  it('creating a user without a password is allowed (invitation flow, no default password)', async () => {
    expect(await run(CreateUserDto, { username: 'new.user', role: 'viewer', fullName: 'New User' })).toEqual([]);
    expect(await run(UpdatePasswordDto, { currentPassword: 'x', newPassword: 'Yeni-Sifre-2026' })).toEqual([]);
  });
  it('customer DTO: invalid VKN and company without tax id are rejected with codes', async () => {
    expect(await run(CreateCustomerDto, { name: 'A', type: 'company', identityType: 'VKN', identityNumber: '4890598017' })).toContain('INVALID_VKN');
    expect(await run(CreateCustomerDto, { name: 'A', type: 'company' })).toContain('TAX_ID_REQUIRED_FOR_COMPANY');
    expect(await run(CreateCustomerDto, { name: 'A', type: 'company', taxNumber: '4890598016' })).toEqual([]);
    expect(await run(CreateCustomerDto, { name: 'B', type: 'individual', identityType: 'TCKN', identityNumber: '11084871202' })).toEqual([]);
  });
});
