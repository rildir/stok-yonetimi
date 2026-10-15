import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { MIGRATIONS } from './migration-list';
import { guardedSynchronize, isDestructiveStatement, syncEnabled } from './schema-sync-guard';

describe('migration list', () => {
  it('contains every migration file, in order', () => {
    const dir = path.resolve(__dirname, '../../migrations');
    const files = fs.readdirSync(dir).filter((f) => /^\d+-.+\.ts$/.test(f) && !f.endsWith('.spec.ts')).sort();
    const fromFiles = files.map((f) => {
      const [ts, name] = f.replace(/\.ts$/, '').split('-');
      return `${name}${ts}`;
    });
    expect(MIGRATIONS.map((m) => m.name)).toEqual(fromFiles);
  });
});

describe('schema sync guard', () => {
  it('recognises statements that would drop data', () => {
    expect(isDestructiveStatement('ALTER TABLE `stock_movements` DROP COLUMN `quantity`')).toBe(true);
    expect(isDestructiveStatement('DROP TABLE `stock_movements`')).toBe(true);
    expect(isDestructiveStatement('ALTER TABLE `products` ADD `availableQuantity` decimal(18,4) NOT NULL')).toBe(false);
    expect(isDestructiveStatement('ALTER TABLE `x` DROP FOREIGN KEY `FK_1`')).toBe(false);
    expect(isDestructiveStatement('DROP INDEX `IDX_1` ON `x`')).toBe(false);
  });

  it('is off in production and with DB_SYNCHRONIZE=false', () => {
    expect(syncEnabled({ NODE_ENV: 'production' } as any)).toBe(false);
    expect(syncEnabled({ DB_SYNCHRONIZE: 'false' } as any)).toBe(false);
    expect(syncEnabled({} as any)).toBe(true);
  });

  function fakeDs(executed: string[] | null, upQueries: string[]) {
    const synchronize = jest.fn(async () => undefined);
    const ds: any = {
      options: {},
      migrations: [{ name: 'A1' }, { name: 'B2' }],
      query: jest.fn(async (sql: string) =>
        sql.includes('information_schema.TABLES') ? [{ n: executed ? 1 : 0 }] : (executed || []).map((name) => ({ name })),
      ),
      driver: { createSchemaBuilder: () => ({ log: async () => ({ upQueries: upQueries.map((query) => ({ query })) }) }) },
      synchronize,
    };
    return { ds, synchronize };
  }

  const prev = process.env['DB_SYNCHRONIZE'];
  beforeAll(() => delete process.env['DB_SYNCHRONIZE']);
  afterAll(() => (prev === undefined ? delete process.env['DB_SYNCHRONIZE'] : (process.env['DB_SYNCHRONIZE'] = prev)));
  const quiet: any = { log: () => undefined };

  it('refuses to start with pending or unknown migrations', async () => {
    await expect(guardedSynchronize(fakeDs(['A1'], []).ds, quiet)).rejects.toThrow(/pending migrations: B2/);
    await expect(guardedSynchronize(fakeDs(['A1', 'B2', 'C3'], []).ds, quiet)).rejects.toThrow(/unknown to this code: C3/);
  });

  it('refuses a sync that would drop a column (it bypasses the ledger triggers)', async () => {
    const { ds, synchronize } = fakeDs(['A1', 'B2'], ['ALTER TABLE `stock_movements` DROP COLUMN `quantity`', 'ALTER TABLE `stock_movements` ADD `quantity` int NOT NULL']);
    await expect(guardedSynchronize(ds, quiet)).rejects.toThrow(/would drop data/);
    expect(synchronize).not.toHaveBeenCalled();
  });

  it('applies additive changes; a sync-only database skips the migration check', async () => {
    const a = fakeDs(['A1', 'B2'], ['ALTER TABLE `products` ADD `x` int NULL']);
    await guardedSynchronize(a.ds, quiet);
    expect(a.synchronize).toHaveBeenCalledTimes(1);
    const b = fakeDs(null, ['CREATE TABLE `t` (`id` int)']);
    await guardedSynchronize(b.ds, quiet);
    expect(b.synchronize).toHaveBeenCalledTimes(1);
    const c = fakeDs(['A1', 'B2'], []);
    await guardedSynchronize(c.ds, quiet);
    expect(c.synchronize).not.toHaveBeenCalled();
  });
});
