import { BadRequestException } from '@nestjs/common';
import { RegistryService } from '../modules/ebelge/registry.service';
import { UserController } from '../modules/user/user.controller';
import { presentAvailability } from './inventory/reservations';
import { maskPayloadForNonPiiReaders, maskPersonalIdentifiers } from './kvkk/masking';

/** Final compliance gaps: registry cache at issue time, availability, masking, login enumeration. */
describe('GİB registry cache at issue time', () => {
  const make = (cached: { registered: boolean; checkedAt: Date } | null, live: boolean) => {
    const checkUser = jest.fn().mockResolvedValue({ registered: live, aliases: live ? ['urn:mail:defaultpk@x'] : [] });
    const m = {
      findOne: jest.fn().mockResolvedValue(cached ? { id: 'c1', aliases: [], ...cached } : null),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn(() => ({ insert: () => ({ into: () => ({ values: () => ({ orIgnore: () => ({ execute: jest.fn() }) }) }) }) })),
    };
    const settings = { resolve: jest.fn().mockResolvedValue({ settings: { registryCacheHours: 24 }, provider: { checkUser }, ctx: {} }), markOutage: jest.fn() };
    const svc = new RegistryService({ manager: m } as any, { companyId: 'co' } as any, settings as any);
    return { svc, checkUser };
  };

  it('uses a fresh cached negative answer for lookups, but re-queries it before issuing', async () => {
    const recent = { registered: false, checkedAt: new Date(Date.now() - 3600_000) };
    let t = make(recent, true);
    expect((await t.svc.check('1234567890', 'INVOICE')).registered).toBe(false);
    expect(t.checkUser).not.toHaveBeenCalled();
    t = make(recent, true);
    const a = await t.svc.check('1234567890', 'INVOICE', { refreshNegative: true });
    expect(t.checkUser).toHaveBeenCalledTimes(1);
    expect(a.registered).toBe(true);
    expect(a.cached).toBe(false);
  });

  it('keeps using a fresh cached positive answer at issue time', async () => {
    const t = make({ registered: true, checkedAt: new Date(Date.now() - 3600_000) }, false);
    const a = await t.svc.check('1234567890', 'INVOICE', { refreshNegative: true });
    expect(t.checkUser).not.toHaveBeenCalled();
    expect(a.registered).toBe(true);
  });
});

describe('product availability in API responses', () => {
  it('availableQuantity is sellable minus reserved; idempotent', () => {
    const p: any = { quantity: 50, availableQuantity: 40 };
    presentAvailability(p, 15);
    expect(p).toMatchObject({ quantity: 50, sellableQuantity: 40, reservedQuantity: 15, availableQuantity: 25 });
    presentAvailability(p, 15);
    expect(p.availableQuantity).toBe(25);
    expect(presentAvailability({ quantity: 3, availableQuantity: 3 } as any, 5).availableQuantity).toBe(0);
  });
});

describe('PII masking for viewers (documents, socket events)', () => {
  it('masks contact data of natural-person parties, not of companies', () => {
    const out: any = maskPersonalIdentifiers({
      buyerSnapshot: { name: 'Ayşe Yılmaz', taxIdType: 'TCKN', taxId: '10000000146', email: 'ayse.yilmaz@ornek.com', phone: '+90 532 418 27 63' },
      sellerSnapshot: { name: 'Demo A.Ş.', taxIdType: 'VKN', taxId: '5640281390', email: 'info@demo.com', phone: '0212 000 00 00' },
    });
    expect(out.buyerSnapshot.taxId).toBe('*******0146');
    expect(out.buyerSnapshot.email).toBe('a*****@ornek.com');
    expect(out.buyerSnapshot.phone).not.toContain('418');
    expect(out.sellerSnapshot.email).toBe('info@demo.com');
    expect(out.sellerSnapshot.phone).toBe('0212 000 00 00');
  });

  it('socket payload copy: identifiers and internal keys removed, original untouched', () => {
    const data = { invoice: { buyerSnapshot: { taxIdType: 'TCKN', taxId: '10000000146', email: 'a.b@x.com' } }, customer: { identityType: 'TCKN', identityNumber: '10000000146', identityNumberHash: 'h', phone: '05324182763' } };
    const masked: any = maskPayloadForNonPiiReaders(data);
    expect(masked.invoice.buyerSnapshot.taxId).toBe('*******0146');
    expect(masked.invoice.buyerSnapshot.email).toBe('a*****@x.com');
    expect(masked.customer.identityNumber).toBe('*******0146');
    expect(masked.customer.identityNumberHash).toBeUndefined();
    expect(masked.customer.phone).toBe('*******2763');
    expect(data.invoice.buyerSnapshot.taxId).toBe('10000000146');
  });
});

describe('sign-in does not reveal whether an account exists', () => {
  const build = (user: any) => {
    const userService = {
      getUserByUsername: jest.fn().mockResolvedValue(user),
      isLockedNow: jest.fn((u: any) => !!u.lockedUntil && new Date(u.lockedUntil) > new Date()),
      isLockedFresh: jest.fn().mockResolvedValue(false),
      recordFailedLogin: jest.fn().mockResolvedValue(true),
      migratePasswordHash: jest.fn(),
    };
    const stockHelper = { burnPasswordCheck: jest.fn(), verifyPassword: jest.fn().mockResolvedValue(false) };
    const audit = { record: jest.fn() };
    const ctrl = new UserController(userService as any, {} as any, stockHelper as any, {} as any, audit as any, {} as any, {} as any);
    return { ctrl, stockHelper, userService };
  };
  const attempt = async (user: any) => {
    const t = build(user);
    const e = await t.ctrl.login({ username: 'x', password: 'wrong' } as any, {}, {}).catch((x) => x);
    return { e, t };
  };

  it('unknown user, locked account, pending invitation and wrong password answer alike', async () => {
    const results = [
      await attempt(null),
      await attempt({ id: 'u1', companyId: 'c', username: 'x', lockedUntil: new Date(Date.now() + 600_000) }),
      await attempt({ id: 'u1', companyId: 'c', username: 'x', inviteTokenHash: 'h' }),
      await attempt({ id: 'u1', companyId: 'c', username: 'x', password: '$2b$10$x' }),
    ];
    for (const { e } of results) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect(e.getStatus()).toBe(400);
      expect((e.getResponse() as any).code).toBe('AUTH_INVALID_CREDENTIALS');
    }
    // Paths without a real hash still spend one bcrypt comparison (timing).
    expect(results[0].t.stockHelper.burnPasswordCheck).toHaveBeenCalled();
    expect(results[1].t.stockHelper.burnPasswordCheck).toHaveBeenCalled();
    // While locked the password is never checked (no oracle) and no further failure is counted.
    expect(results[1].t.stockHelper.verifyPassword).not.toHaveBeenCalled();
    expect(results[1].t.userService.recordFailedLogin).not.toHaveBeenCalled();
    // A wrong password still counts towards the lockout.
    expect(results[3].t.userService.recordFailedLogin).toHaveBeenCalled();
  });
});
