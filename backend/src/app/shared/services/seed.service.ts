import * as fs from 'fs';
import * as path from 'path';
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, IsNull } from 'typeorm';
import { UserEntity } from '../../entities/user.entity';
import { CompanyEntity, DEFAULT_COMPANY } from '../../entities/company.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { ProductEntity } from '../../entities/product.entity';
import { OrderEntity } from '../../entities/order.entity';
import { OrderItemEntity } from '../../entities/order-item.entity';
import { StockHelperService } from './stock-helper.service';
import { WarehouseStockService } from './warehouse-stock.service';
import { CustomerEntity } from '../../entities/customer.entity';
import { TaxRateEntity } from '../../entities/tax-rate.entity';
import { defaultTaxRatesFor } from '../finance/tax-defaults';
import { calculateLine, calculateTotals } from '../finance/tax';
import { UserRole, OrderStatus, StockMovementType } from '../../entities/enums';
import { UnitEntity } from '../../entities/unit.entity';
import { ProductUnitEntity } from '../../entities/product-unit.entity';
import { SerialNumberEntity, SerialStatus } from '../../entities/serial-number.entity';
import { ProductWarehouseStockEntity } from '../../entities/product-warehouse-stock.entity';
import { TrackingType } from '../../entities/tracking';
import { STANDARD_UNITS, legacyUnitCode } from '../inventory/units';
import { makeEan13 } from '../inventory/barcode';
import { todayKey } from '../inventory/lot-allocation';
import { randomBytes } from 'crypto';
import { DistrictEntity, ProvinceEntity, TaxOfficeEntity } from '../../entities/refdata.entity';
import { LegalParameterEntity } from '../../entities/legal-parameter.entity';
import { TR_DISTRICTS, TR_PROVINCES, TR_TAX_OFFICES } from '../refdata/tr-refdata';
import { LEGAL_PARAMETER_SEEDS } from '../legal/legal-parameter-seeds';
import { seedDemoFiscalData } from './demo-fiscal.seed';
import { isStrongPassword, NON_SI_STANDARD_UNIT_CODES, STANDARD_UNIT_DECIMALS } from '../tr';
import { seedDemoInventoryCore } from './demo-inventory.seed';
import { seedDemoTaxData } from './demo-tax.seed';
import { taxCodeSeedStatements } from '../finance/tax-code-seeds';
import { WP3_FIX2_PARAMETER_KEYS, WP3_FIX_PARAMETER_KEYS, WP3_PARAMETER_KEYS } from '../legal/legal-parameter-seeds';
import { randomUUID } from 'crypto';
import { ensureImmutabilityTriggers } from '../inventory/immutability-triggers';
import { pickParameter } from './legal-parameter.service';

/** Non-production demo accounts of the default company (passwords: see SeedService.demoAccountPasswords). */
const DEMO_ACCOUNTS: (Partial<UserEntity> & { username: string })[] = [
  { username: 'manager', role: UserRole.MANAGER, fullName: 'Yönetici Demo', email: 'manager@sirket.com', department: 'Stok Yönetimi' },
  { username: 'viewer', role: UserRole.VIEWER, fullName: 'Gözlemci Demo', email: 'viewer@sirket.com', department: 'Gözlem Ekibi' },
  { username: 'demo', role: UserRole.VIEWER, fullName: 'Demo Kullanıcısı', email: 'demo@sirket.com', department: 'Demo Modu' },
];

@Injectable()
export class SeedService implements OnModuleInit {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepo: Repository<CategoryEntity>,
    @InjectRepository(WarehouseEntity)
    private readonly warehouseRepo: Repository<WarehouseEntity>,
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    private readonly stockHelper: StockHelperService,
    private readonly warehouseStock: WarehouseStockService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.ensureReferenceData();
    await this.seedMockDataIfEmpty();
    await this.ensureUnits();
    await this.seedTrackingDemo(DEFAULT_COMPANY.id);
    await seedDemoFiscalData(this.dataSource.manager, DEFAULT_COMPANY.id, this.logger);
    await this.ensureInventoryCore();
    await seedDemoInventoryCore(this.dataSource, DEFAULT_COMPANY.id, this.warehouseStock, this.logger);
    await this.ensureTaxEngine();
    await seedDemoTaxData(this.dataSource, DEFAULT_COMPANY.id, this.warehouseStock, this.logger);
  }

  /**
   * WP3 safety net for databases built by schema sync (migration 1784274132000 does the same
   * otherwise): code tables, WP3 legal parameters, the KDV0 exemption row of TR companies and
   * an explicit rate on TR products (no silent default at pricing time). Idempotent.
   */
  private async ensureTaxEngine() {
    const m = this.dataSource.manager;
    const [ex] = await m.query('SELECT COUNT(*) AS n FROM `tax_exemption_codes`');
    if (!Number(ex?.n)) {
      this.logger.log('Seeding UBL-TR tax code lists...');
      for (const st of taxCodeSeedStatements(randomUUID)) await m.query(st.sql, st.params);
    }
    for (const p of LEGAL_PARAMETER_SEEDS.filter((x) => WP3_PARAMETER_KEYS.includes(x.key) || WP3_FIX_PARAMETER_KEYS.includes(x.key) || WP3_FIX2_PARAMETER_KEYS.includes(x.key))) {
      await m.query(
        'INSERT IGNORE INTO `legal_parameters` (`id`, `country`, `key`, `validFrom`, `validTo`, `value`, `sourceRef`, `confidence`, `note`, `createdBy`) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [randomUUID(), p.country, p.key, p.validFrom, p.validTo, JSON.stringify(p.value), p.sourceRef, p.confidence, p.note || null, 'seed'],
      );
    }
    const trCompanies: { id: string }[] = await m.query("SELECT `id` FROM `companies` WHERE `country` = 'TR'");
    for (const c of trCompanies) {
      const has = await m.exists(TaxRateEntity, { where: { companyId: c.id, kind: 'EXEMPT', isDeleted: false } });
      if (!has) {
        const row = defaultTaxRatesFor('TR').find((r) => r.kind === 'EXEMPT')!;
        await m.save(TaxRateEntity, m.create(TaxRateEntity, { ...row, companyId: c.id }));
      }
      await m.query(
        'UPDATE `products` p JOIN `tax_rates` t ON t.`companyId` = p.`companyId` AND t.`isDefault` = 1 AND t.`isDeleted` = 0 ' +
          'SET p.`taxRateId` = t.`id` WHERE p.`companyId` = ? AND p.`taxRateId` IS NULL',
        [c.id],
      );
    }
  }

  /**
   * WP2 safety net for databases built by schema sync (migration 1784274129000 does the
   * same otherwise): immutability triggers and the movement chain heads. Idempotent.
   */
  private async ensureInventoryCore() {
    const created = await ensureImmutabilityTriggers((sql, params) => this.dataSource.query(sql, params));
    if (created.length) this.logger.log(`Created immutability triggers: ${created.join(', ')}`);
  }

  /** Standard unit -> UN/ECE code from legal parameter UNECE_STANDARD_UNIT_MAP (low confidence for pack / pallet). */
  private async uneceMap(): Promise<Record<string, string>> {
    const rows = await this.dataSource.manager.find(LegalParameterEntity, { where: { country: 'TR', key: 'UNECE_STANDARD_UNIT_MAP' } });
    const row = pickParameter(rows, new Date().toISOString().slice(0, 10));
    return (row?.value as Record<string, string>) || {};
  }

  /**
   * Global reference tables + legal parameters for databases built by schema
   * sync (migration 1784274127000 seeds them otherwise). Idempotent.
   */
  private async ensureReferenceData() {
    const m = this.dataSource.manager;
    if (!(await m.count(ProvinceEntity))) {
      this.logger.log('Seeding provinces / districts / tax offices...');
      await m.insert(ProvinceEntity, TR_PROVINCES.map(([code, name]) => ({ code, name })));
      for (let i = 0; i < TR_DISTRICTS.length; i += 300) {
        await m.insert(DistrictEntity, TR_DISTRICTS.slice(i, i + 300).map(([id, provinceCode, name]) => ({ id, provinceCode, name })));
      }
      for (let i = 0; i < TR_TAX_OFFICES.length; i += 300) {
        await m.insert(TaxOfficeEntity, TR_TAX_OFFICES.slice(i, i + 300).map(([code, provinceCode, name, district]) => ({ code, provinceCode, name, district: district || null })));
      }
    }
    if (!(await m.count(LegalParameterEntity))) {
      this.logger.log('Seeding legal parameters...');
      for (const p of LEGAL_PARAMETER_SEEDS) {
        await m.save(LegalParameterEntity, m.create(LegalParameterEntity, { ...p, note: p.note ?? null, createdBy: 'seed' }));
      }
    }
  }

  /**
   * Initial admin password: ADMIN_PASSWORD (must satisfy the policy) or a random
   * one-time password. The generated password is never written to the log: it goes
   * to a file readable only by the service account (INITIAL_ADMIN_PASSWORD_FILE,
   * default ./initial-admin-password.txt); the log only names the file.
   */
  private initialAdminPassword(): { password: string; mustChange: boolean } {
    const env = process.env.ADMIN_PASSWORD;
    if (env && isStrongPassword(env)) return { password: env, mustChange: false };
    const generated = `${randomBytes(9).toString('base64url')}#7a`;
    const file = path.resolve(process.env.INITIAL_ADMIN_PASSWORD_FILE || 'initial-admin-password.txt');
    try {
      fs.writeFileSync(file, `${generated}
`, { mode: 0o600 });
      this.logger.warn(
        `ADMIN_PASSWORD ${env ? 'does not meet the password policy' : 'is not set'}; a one-time admin password was written to ${file} (must be changed at first sign-in; delete the file afterwards).`,
      );
    } catch (e) {
      this.logger.error(`Could not write the one-time admin password to ${file}: ${(e as Error).message}. Set ADMIN_PASSWORD and restart.`);
    }
    return { password: generated, mustChange: true };
  }

  /**
   * Every company gets the standard units and every product a base unit
   * (mapped from the legacy `unit` text). Mirrors migration 1784274125000 for
   * databases created by schema sync; idempotent.
   */
  private async ensureUnits() {
    const m = this.dataSource.manager;
    const unece = await this.uneceMap();
    for (const c of await m.find(CompanyEntity)) {
      const units = await m.find(UnitEntity, { where: { companyId: c.id } });
      for (const u of STANDARD_UNITS) {
        // lb is not offered to Turkish companies (SI units, 3516 s.K.); existing ones are kept and flagged.
        if (c.country === 'TR' && NON_SI_STANDARD_UNIT_CODES.includes(u.code)) continue;
        if (!units.some((x) => x.code === u.code)) {
          const decimals = STANDARD_UNIT_DECIMALS[u.code] ?? 0;
          units.push(
            await m.save(
              UnitEntity,
              m.create(UnitEntity, { ...u, companyId: c.id, isStandard: true, decimals, allowsFraction: decimals > 0, uneceCode: unece[u.code] ?? null }),
            ),
          );
        }
      }
      for (const u of units) {
        if (u.isStandard && !u.uneceCode && unece[u.code]) await m.update(UnitEntity, { id: u.id }, { uneceCode: unece[u.code] });
      }
      const orphans = await m.find(ProductEntity, { where: { companyId: c.id, baseUnitId: IsNull() } });
      for (const p of orphans) {
        const code = legacyUnitCode(p.unit) || (p.unit || 'pcs').trim().toLowerCase().slice(0, 20);
        let unit = units.find((u) => u.code === code);
        if (!unit) {
          unit = await m.save(UnitEntity, m.create(UnitEntity, { companyId: c.id, code, name: p.unit, isStandard: false }));
          units.push(unit);
        }
        await m.update(ProductEntity, { id: p.id }, { baseUnitId: unit.id, unit: unit.code });
      }
    }
  }

  /**
   * Demo data for barcodes / lots / serials / units (demo company only, runs
   * once: guarded by the TP-GEL demo SKU). Stock goes through
   * WarehouseStockService so lots, serials, warehouse rows and movements agree.
   */
  private async seedTrackingDemo(companyId: string) {
    const m = this.dataSource.manager;
    if (!(await m.exists(CompanyEntity, { where: { id: companyId } }))) return;
    if (await m.exists(ProductEntity, { where: { companyId, sku: 'TP-GEL' } })) return;
    const warehouses = await this.warehouseStock.activeWarehouses(m, companyId);
    if (warehouses.length === 0) return;
    this.logger.log('Seeding barcode / lot / serial / unit demo data...');
    const units = await m.find(UnitEntity, { where: { companyId } });
    const unit = (code: string) => units.find((u) => u.code === code) as UnitEntity;
    const company = await m.findOneByOrFail(CompanyEntity, { id: companyId });
    const day = (offset: number) => {
      const d = new Date(`${todayKey(company.timezone)}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    const wh1 = warehouses[0].id;
    const wh2 = (warehouses[1] || warehouses[0]).id;

    await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, companyId);
      // Barcodes (EAN-13, Turkish GS1 prefix 869) for existing demo products without one.
      const products = await manager.find(ProductEntity, { where: { companyId, isDeleted: false }, order: { createdAt: 'ASC' } });
      let seq = 1;
      for (const p of products) {
        if (p.barcode) continue;
        const code = makeEan13(`869100${String(seq++).padStart(6, '0')}`);
        await manager.update(ProductEntity, { id: p.id }, { barcode: code, barcodeType: 'EAN13' });
        p.barcode = code;
      }

      // Box units: MS-320 (box of 10) and HB-81 (box of 5), each with its own barcode.
      for (const [sku, factor, n] of [['MS-320', 10, 1], ['HB-81', 5, 2]] as const) {
        const p = products.find((x) => x.sku === sku);
        if (!p || (await manager.exists(ProductUnitEntity, { where: { productId: p.id, unitId: unit('box').id } }))) continue;
        await manager.save(ProductUnitEntity, manager.create(ProductUnitEntity, {
          companyId, productId: p.id, unitId: unit('box').id, factor, barcode: makeEan13(`869200${String(n).padStart(6, '0')}`),
        }));
      }

      // Lot + expiry demo products.
      const lotProducts = [
        {
          name: 'Thermal Paste Gel 4g', sku: 'TP-GEL', price: 9.99, minQuantity: 20, barcode: makeEan13('869300000001'),
          box: { factor: 12, barcode: makeEan13('869300000002') },
          lots: [
            { wh: wh1, lotNumber: 'TPG-2405', expiryDate: day(20), quantity: 24 },
            { wh: wh1, lotNumber: 'TPG-2409', expiryDate: day(200), quantity: 36 },
            { wh: wh2, lotNumber: 'TPG-2407', expiryDate: day(90), quantity: 12 },
          ],
        },
        {
          name: 'Screen Cleaning Wipes (50)', sku: 'SC-WIPE', price: 5.99, minQuantity: 15, barcode: makeEan13('869300000003'),
          box: { factor: 24, barcode: makeEan13('869300000004') },
          lots: [
            { wh: wh1, lotNumber: 'SCW-0921', expiryDate: day(10), quantity: 10 },
            { wh: wh1, lotNumber: 'SCW-1102', expiryDate: day(150), quantity: 40 },
            { wh: wh2, lotNumber: 'SCW-0815', expiryDate: day(-5), quantity: 4 },
          ],
        },
      ];
      for (const lp of lotProducts) {
        const prod = await manager.save(ProductEntity, manager.create(ProductEntity, {
          companyId, name: lp.name, sku: lp.sku, category: 'Accessories', price: lp.price, minQuantity: lp.minQuantity,
          currency: company.baseCurrency, quantity: 0, status: this.stockHelper.calculateStatus(0, lp.minQuantity),
          unit: 'pcs', baseUnitId: unit('pcs').id, barcode: lp.barcode, barcodeType: 'EAN13',
          trackingType: TrackingType.LOT, hasExpiry: true, isDeleted: false,
        }));
        await manager.save(ProductUnitEntity, manager.create(ProductUnitEntity, {
          companyId, productId: prod.id, unitId: unit('box').id, factor: lp.box.factor, barcode: lp.box.barcode,
        }));
        for (const wh of [...new Set(lp.lots.map((l) => l.wh))]) {
          const lots = lp.lots.filter((l) => l.wh === wh);
          const before = prod.quantity;
          const allocs = await this.warehouseStock.receive(manager, prod, lots.reduce((s, l) => s + l.quantity, 0), wh, { lots });
          await this.warehouseStock.recordMovements(manager, prod, before, allocs, {
            type: StockMovementType.IN, reasonCode: 'OPENING', referenceType: 'manual', note: 'Demo lot stock', performedBy: 'SeedSystem',
          });
        }
      }

      // Serial demo: Noise Cancelling Headphones become serial-tracked; one serial per unit already in stock.
      const hp = products.find((x) => x.sku === 'HP-NC4');
      if (hp && (hp.trackingType || TrackingType.NONE) === TrackingType.NONE) {
        const rows = await manager.find(ProductWarehouseStockEntity, { where: { companyId, productId: hp.id } });
        let n = 1;
        for (const r of rows) {
          for (let i = 0; i < r.quantity; i++) {
            await manager.save(SerialNumberEntity, manager.create(SerialNumberEntity, {
              companyId, productId: hp.id, warehouseId: r.warehouseId, serial: `HPNC4-${String(n++).padStart(5, '0')}`, status: SerialStatus.IN_STOCK,
            }));
          }
        }
        await manager.update(ProductEntity, { id: hp.id }, { trackingType: TrackingType.SERIAL });
      }
    });
  }

  /**
   * Passwords of the demo accounts (manager / viewer / demo): DEMO_ACCOUNT_PASSWORD when it meets the
   * policy, otherwise a random password per account. Random ones are written to
   * DEMO_ACCOUNT_PASSWORDS_FILE (default ./demo-account-passwords.txt, mode 0600), never to the log.
   */
  private demoAccountPasswords(usernames = DEMO_ACCOUNTS.map((d) => d.username)): Record<string, string> {
    const env = process.env.DEMO_ACCOUNT_PASSWORD;
    const out: Record<string, string> = {};
    if (env && isStrongPassword(env)) {
      for (const u of usernames) out[u] = env;
      return out;
    }
    for (const u of usernames) out[u] = `${randomBytes(12).toString('base64url')}#7a`;
    const file = path.resolve(process.env.DEMO_ACCOUNT_PASSWORDS_FILE || 'demo-account-passwords.txt');
    try {
      fs.appendFileSync(file, usernames.map((u) => `${u}: ${out[u]}`).join('\n') + '\n', { mode: 0o600 });
      this.logger.warn(`Demo account passwords (${usernames.join(', ')}) were written to ${file}; set DEMO_ACCOUNT_PASSWORD to choose one.`);
    } catch (e) {
      this.logger.error(`Could not write the demo account passwords to ${file}: ${(e as Error).message}. Set DEMO_ACCOUNT_PASSWORD and restart.`);
    }
    return out;
  }

  /**
   * Existing installations: a demo account that still carries its old well-known password
   * (manager123 / viewer123 / demo123) with a pending forced change could be claimed by whoever
   * signs in first. Such accounts get a new strong password (see demoAccountPasswords) and their
   * sessions are revoked. A missing "demo" account is recreated the same way. Idempotent.
   */
  private async secureDemoAccounts(companyId: string) {
    const legacy: Record<string, string> = { manager: 'manager123', viewer: 'viewer123', demo: 'demo123' };
    const toRotate: UserEntity[] = [];
    for (const d of DEMO_ACCOUNTS) {
      const u = await this.userRepo.findOne({ where: { username: d.username } });
      if (!u || u.companyId !== companyId) continue;
      if (u.mustChangePassword && (await this.stockHelper.verifyPassword(legacy[d.username], u.password))) toRotate.push(u);
    }
    const missingDemo = !(await this.userRepo.exists({ where: { username: 'demo' } }));
    const names = [...toRotate.map((u) => u.username), ...(missingDemo ? ['demo'] : [])];
    if (!names.length) return;
    const pw = this.demoAccountPasswords(names);
    for (const u of toRotate) {
      this.logger.warn(`Demo account "${u.username}" still had its well-known password; it was replaced.`);
      await this.userRepo.update({ id: u.id }, { password: this.stockHelper.hashPassword(pw[u.username]), mustChangePassword: false, tokenVersion: (u.tokenVersion || 0) + 1 });
    }
    if (missingDemo) {
      const d = DEMO_ACCOUNTS.find((x) => x.username === 'demo')!;
      this.logger.log('Seeding demo user account (demo)...');
      await this.userRepo.save(this.userRepo.create({ ...d, companyId, password: this.stockHelper.hashPassword(pw['demo']), mustChangePassword: false, tokenVersion: 0 }));
    }
  }

  /** Ensures the default "Demo Şirketi" tenant exists and returns its id. */
  private async ensureDefaultCompany(): Promise<string> {
    const companyRepo = this.dataSource.getRepository(CompanyEntity);
    const existing = await companyRepo.findOne({ where: [{ id: DEFAULT_COMPANY.id }, { slug: DEFAULT_COMPANY.slug }] });
    if (existing) return existing.id;
    this.logger.log(`Creating default company "${DEFAULT_COMPANY.name}"...`);
    const saved = await companyRepo.save(companyRepo.create({ ...DEFAULT_COMPANY }));
    return saved.id;
  }

  private async seedMockDataIfEmpty() {
    const companyId = await this.ensureDefaultCompany();
    const userCount = await this.userRepo.count();
    if (userCount === 0) {
      this.logger.log('Users table is empty. Seeding initial users...');
      const isProduction = process.env.NODE_ENV === 'production';
      const adminPw = this.initialAdminPassword();
      const initialUsers: Partial<UserEntity>[] = [
        {
          username: process.env.ADMIN_USERNAME || 'admin',
          password: this.stockHelper.hashPassword(adminPw.password),
          mustChangePassword: adminPw.mustChange,
          isSuperAdmin: true,
          role: UserRole.ADMIN,
          fullName: 'Ahmet Ildır',
          email: 'admin@sirket.com',
          department: 'Sistem Yönetimi',
          tokenVersion: 0,
        },
      ];

      if (!isProduction) {
        // Demo accounts get strong passwords that are not guessable (DEMO_ACCOUNT_PASSWORD or random,
        // written to a 0600 file) and need no first-sign-in change: a well-known password with a
        // forced change would let whoever signs in first claim the account.
        const demoPw = this.demoAccountPasswords();
        for (const d of DEMO_ACCOUNTS) {
          initialUsers.push({ ...d, password: this.stockHelper.hashPassword(demoPw[d.username]), mustChangePassword: false, tokenVersion: 0 });
        }
      }

      for (const u of initialUsers) {
        await this.userRepo.save(this.userRepo.create({ ...u, companyId }));
      }
    } else {
      if (process.env.NODE_ENV !== 'production') await this.secureDemoAccounts(companyId);
    }

    const categoryCount = await this.categoryRepo.count({ where: { companyId } });
    if (categoryCount === 0) {
      this.logger.log('Categories table is empty. Seeding initial categories...');
      const initialCategories = [
        { name: 'Aksesuarlar', slug: 'Accessories' },
        { name: 'Ses Ekipmanları', slug: 'Audio' },
        { name: 'Monitörler', slug: 'Monitors' },
        { name: 'Giyilebilir Teknoloji', slug: 'Wearables' },
        { name: 'Ofis Mobilyası', slug: 'Furniture' },
      ];
      for (const cat of initialCategories) {
        await this.categoryRepo.save(this.categoryRepo.create({ ...cat, companyId }));
      }
    }

    const warehouseCount = await this.warehouseRepo.count({ where: { companyId } });
    if (warehouseCount === 0) {
      this.logger.log('Warehouses table is empty. Seeding initial warehouses...');
      const initialWarehouses = [
        { name: 'Merkez Depo', code: 'WH-001', address: { line1: 'Merkez', provinceCode: '34', province: 'İstanbul', country: 'TR' } },
        { name: 'Ataşehir Şube', code: 'WH-002', address: { line1: 'Barbaros Mah.', districtId: 3403, district: 'Ataşehir', provinceCode: '34', province: 'İstanbul', country: 'TR' } },
      ];
      for (const wh of initialWarehouses) {
        await this.warehouseRepo.save(this.warehouseRepo.create({ ...wh, companyId }));
      }
    }

    // Starter tax rates (KDV %20 default, %10, %1 for TR).
    const taxCount = await this.dataSource.manager.count(TaxRateEntity, { where: { companyId } });
    if (taxCount === 0) {
      const company = await this.dataSource.getRepository(CompanyEntity).findOneByOrFail({ id: companyId });
      for (const t of defaultTaxRatesFor(company.country)) {
        await this.dataSource.getRepository(TaxRateEntity).save({ ...t, companyId });
      }
    }

    const productCount = await this.productRepo.count({ where: { companyId } });
    if (productCount > 0) return;

    this.logger.log('Database is empty. Seeding initial products & orders...');

    const company = await this.dataSource.getRepository(CompanyEntity).findOneByOrFail({ id: companyId });
    const defaultTax = await this.dataSource.getRepository(TaxRateEntity).findOne({ where: { companyId, isDefault: true } });
    const taxPct = defaultTax ? Number(defaultTax.rate) : 0;

    // Per-warehouse opening stock: [Merkez Depo, Ataşehir Şube]
    const initialProducts: (Partial<ProductEntity> & { stock: [number, number] })[] = [
      { name: 'Wireless Mouse M320', sku: 'MS-320', category: 'Accessories', price: 29.99, minQuantity: 10, stock: [30, 15] },
      { name: 'Mechanical Keyboard K85', sku: 'KB-85', category: 'Accessories', price: 89.99, minQuantity: 15, stock: [5, 3] },
      { name: 'UltraWide Monitor 34"', sku: 'MN-34U', category: 'Monitors', price: 449.99, minQuantity: 5, stock: [0, 0] },
      { name: 'USB-C Hub 8-in-1', sku: 'HB-81', category: 'Accessories', price: 49.99, minQuantity: 10, stock: [40, 20] },
      { name: 'Noise Cancelling Headphones', sku: 'HP-NC4', category: 'Audio', price: 199.99, minQuantity: 10, stock: [8, 4] },
      { name: 'Ergonomic Office Chair', sku: 'CH-ERGO', category: 'Furniture', price: 289.99, minQuantity: 5, stock: [2, 1] },
      { name: 'Webcam HD 1080p', sku: 'WC-1080', category: 'Accessories', price: 69.99, minQuantity: 8, stock: [15, 10] },
      { name: 'Bluetooth Speaker Portable', sku: 'SP-BT5', category: 'Audio', price: 39.99, minQuantity: 5, stock: [1, 0] },
      { name: 'Smart Watch Series 5', sku: 'SW-S5', category: 'Wearables', price: 249.99, minQuantity: 8, stock: [0, 0] },
      { name: 'Laptop Stand Aluminum', sku: 'LS-ALUM', category: 'Accessories', price: 34.99, minQuantity: 10, stock: [50, 30] },
    ];

    const today = new Date();
    const mockOrderTemplates = [
      { customer: 'Ahmet Yılmaz', daysAgo: 0, status: OrderStatus.COMPLETED, items: [{ pIndex: 0, qty: 2 }, { pIndex: 3, qty: 1 }] },
      { customer: 'Mehmet Kaya', daysAgo: 1, status: OrderStatus.COMPLETED, items: [{ pIndex: 4, qty: 1 }, { pIndex: 9, qty: 1 }] },
      { customer: 'Ayşe Demir', daysAgo: 1, status: OrderStatus.COMPLETED, items: [{ pIndex: 1, qty: 1 }] },
      { customer: 'Fatma Şahin', daysAgo: 2, status: OrderStatus.PENDING, items: [{ pIndex: 6, qty: 2 }] },
      { customer: 'Ali Çelik', daysAgo: 3, status: OrderStatus.COMPLETED, items: [{ pIndex: 3, qty: 3 }, { pIndex: 9, qty: 2 }] },
    ];

    await this.dataSource.transaction(async (manager) => {
      await this.warehouseStock.begin(manager, companyId);
      const warehouses = await this.warehouseStock.activeWarehouses(manager, companyId);
      const savedProducts: ProductEntity[] = [];
      for (const { stock, ...p } of initialProducts) {
        const prod = await manager.save(
          ProductEntity,
          manager.create(ProductEntity, {
            ...p,
            companyId,
            currency: company.baseCurrency,
            quantity: 0,
            status: this.stockHelper.calculateStatus(0, p.minQuantity!),
            isDeleted: false,
          })
        );
        const allocations = stock
          .map((qty, i) => ({ warehouseId: warehouses[i]?.id ?? warehouses[0]?.id, delta: qty }))
          .filter((a) => a.warehouseId && a.delta > 0);
        await this.warehouseStock.apply(manager, prod, allocations);
        // Dated before the demo orders: a sale may not precede the stock it is taken from.
        const openingDate = new Date(today.getTime() - 30 * 86400000);
        await this.warehouseStock.recordMovements(manager, prod, 0, allocations, {
          type: StockMovementType.IN, reasonCode: 'OPENING', transactionDate: openingDate, referenceType: 'manual', note: 'Initial seed stock', performedBy: 'SeedSystem',
        });
        savedProducts.push(prod);
      }

      // Customers + orders
      const customers = new Map<string, CustomerEntity>();
      for (let i = 0; i < mockOrderTemplates.length; i++) {
        const template = mockOrderTemplates[i];
        const orderDate = new Date();
        orderDate.setDate(today.getDate() - template.daysAgo);
        const orderNum = `ORD-${202600 + i + 1}`;

        let customer = customers.get(template.customer);
        if (!customer) {
          customer = await manager.save(CustomerEntity, manager.create(CustomerEntity, {
            companyId, name: template.customer, type: 'individual', country: company.country, currency: company.baseCurrency,
          }));
          customers.set(template.customer, customer);
        }

        const lines = [];
        const itemEntities: OrderItemEntity[] = [];
        for (const item of template.items) {
          const prod = savedProducts[item.pIndex];
          const oldQty = prod.quantity;
          const allocations = await this.warehouseStock.deduct(manager, prod, item.qty, null, { sale: true });
          await this.warehouseStock.recordMovements(manager, prod, oldQty, allocations, {
            type: StockMovementType.ORDER, reasonCode: 'SALE', transactionDate: orderDate,
            documentType: 'ORDER', documentNo: orderNum, documentDate: orderDate.toISOString().slice(0, 10),
            referenceId: orderNum, referenceType: 'order',
            note: `Initial seed order: ${orderNum}`, performedBy: 'SeedSystem',
          });
          const line = calculateLine({ quantity: item.qty, unitPrice: prod.price, taxRate: taxPct }, company.pricesIncludeTax);
          lines.push(line);
          itemEntities.push(manager.create(OrderItemEntity, {
            productId: prod.id, productName: prod.name, quantity: item.qty, unitQuantity: item.qty, unitFactor: 1, unitCode: 'pcs',
            price: line.unitPrice, unitPrice: line.unitPrice, taxRate: line.taxRate, taxAmount: line.taxAmount, lineTotal: line.lineTotal,
          }));
        }
        const totals = calculateTotals(lines);

        await manager.save(OrderEntity, manager.create(OrderEntity, {
          companyId,
          orderNumber: orderNum,
          customerId: customer.id,
          customerName: template.customer,
          date: orderDate,
          status: template.status,
          currency: company.baseCurrency,
          exchangeRate: 1,
          subtotal: totals.subtotal,
          taxTotal: totals.taxTotal,
          grandTotal: totals.grandTotal,
          totalAmount: totals.grandTotal,
          items: itemEntities,
        }));
      }
    });

    this.logger.log('Initial data seed complete with transactional stock deduction.');
  }
}

