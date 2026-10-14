import { UnauthorizedException } from '@nestjs/common';
import { TenantContext } from './tenant-context.service';

describe('TenantContext', () => {
  const ctx = new TenantContext();

  it('throws when no tenant is set', () => {
    expect(() => ctx.companyId).toThrow(UnauthorizedException);
  });

  it('isolates concurrent async contexts', async () => {
    const read = (id: string) =>
      ctx.run(id, async () => {
        await new Promise((r) => setTimeout(r, 5));
        return ctx.companyId;
      });
    await expect(Promise.all([read('a'), read('b')])).resolves.toEqual(['a', 'b']);
  });

  it('middleware store is filled by set()', (done) => {
    TenantContext.middleware({}, {}, () => {
      ctx.set('c-1', 'user');
      setImmediate(() => {
        expect(ctx.companyId).toBe('c-1');
        done();
      });
    });
  });
});
