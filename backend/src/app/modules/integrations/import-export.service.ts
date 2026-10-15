import { err } from '../../shared/i18n/app-error';
import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { ProductEntity } from '../../entities/product.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { OrderEntity } from '../../entities/order.entity';
import { CategoryEntity } from '../../entities/category.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { CreateProductDto, UpdateProductDto } from '../../dto/product.dto';
import { CreateCustomerDto, UpdateCustomerDto } from '../../dto/customer.dto';
import { CreateSupplierDto, UpdateSupplierDto } from '../../dto/supplier.dto';
import { SupplierService } from '../supplier/supplier.service';
import { RefdataService } from '../../shared/services/refdata.service';
import { resolvePartyIdentity } from '../../shared/identity/party-identity';
import { trKey } from '../../shared/refdata/legacy-address';
import { ProductService } from '../product/product.service';
import { CustomerService } from '../customer/customer.service';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { Lang, translate } from '../../shared/i18n/messages';
import { isCodedErrorBody } from '../../shared/i18n/app-error';
import { parseValidationMessage } from '../../shared/i18n/i18n-exception.filter';
import { parseCsvObjects, toCsv } from '../../shared/integrations/csv';

export const PRODUCT_CSV_COLUMNS = ['sku', 'name', 'category', 'price', 'quantity', 'minQuantity', 'unit', 'barcode', 'barcodeType', 'supplierId'];
/** Address columns shared by customer / supplier CSVs (district by name within the province). */
const ADDRESS_CSV_COLUMNS = ['addressLine1', 'addressLine2', 'provinceCode', 'district', 'postalCode', 'country'];
export const CUSTOMER_CSV_COLUMNS = [
  'name', 'type', 'identityType', 'identityNumber', 'taxOfficeCode', 'taxOfficeName', 'isVatTaxpayer', 'isDesignatedBuyer',
  'email', 'phone', ...ADDRESS_CSV_COLUMNS, 'currency', 'notes',
];
/** Pre-WP1 customer columns still accepted on import. */
export const LEGACY_CUSTOMER_CSV_COLUMNS = ['taxNumber', 'address', 'city'];
export const SUPPLIER_CSV_COLUMNS = [
  'name', 'type', 'identityType', 'identityNumber', 'taxOfficeCode', 'taxOfficeName', 'isTaxpayer', 'isVatTaxpayer', 'isForeign', 'isRealTaxationFarmer',
  'contactPerson', 'email', 'phone', ...ADDRESS_CSV_COLUMNS, 'rating', 'leadTimeDays', 'notes',
];
const MAX_ROWS = 5000;

export interface ImportRowError {
  row: number;
  field?: string;
  code: string;
  message: string;
}

export interface ImportReport {
  dryRun: boolean;
  total: number;
  valid: number;
  invalid: number;
  created: number;
  updated: number;
  errors: ImportRowError[];
}

const num = (v: string | undefined) => (v === undefined || v === '' ? undefined : Number(v.replace(',', '.')));
const str = (v: string | undefined) => (v === undefined || v === '' ? undefined : v);
const bool = (v: string | undefined) => {
  if (v === undefined || v === '') return undefined;
  const k = v.trim().toLocaleLowerCase('tr-TR');
  if (['1', 'true', 'evet', 'yes', 'e', 'y'].includes(k)) return true;
  if (['0', 'false', 'hayır', 'hayir', 'no', 'h', 'n'].includes(k)) return false;
  return v as unknown as boolean; // let the validator reject it
};

/** Flattens an entity's embedded address for CSV export. */
const flatAddress = (a?: { line1?: string | null; line2?: string | null; provinceCode?: string | null; province?: string | null; district?: string | null; postalCode?: string | null; country?: string | null } | null) => ({
  addressLine1: a?.line1 ?? '',
  addressLine2: a?.line2 ?? '',
  provinceCode: a?.provinceCode ?? '',
  province: a?.province ?? '',
  district: a?.district ?? '',
  postalCode: a?.postalCode ?? '',
  country: a?.country ?? '',
});

@Injectable()
export class ImportExportService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenant: TenantContext,
    private readonly products: ProductService,
    private readonly customers: CustomerService,
    private readonly suppliers: SupplierService,
    private readonly refdata: RefdataService,
  ) {}

  /** CSV address columns -> AddressDto-like object (district name resolved within the province). */
  private async csvAddress(r: Record<string, string>, legacy = false): Promise<Record<string, unknown> | undefined> {
    const line1 = str(r['addressLine1']) ?? (legacy ? str(r['address']) : undefined);
    let provinceCode = str(r['provinceCode']);
    const city = legacy ? str(r['city']) : undefined;
    if (!provinceCode && city) provinceCode = (await this.refdata.listProvinces()).find((p) => trKey(p.name) === trKey(city))?.code;
    const district = str(r['district']);
    const out: Record<string, unknown> = { line1, line2: str(r['addressLine2']), provinceCode, postalCode: str(r['postalCode']), country: str(r['country'])?.toUpperCase() };
    if (district) {
      const d = provinceCode ? (await this.refdata.listDistricts(provinceCode)).find((x) => trKey(x.name) === trKey(district)) : undefined;
      if (d) out['districtId'] = d.id;
      else if (provinceCode) out['districtId'] = -1; // unknown district -> INVALID_DISTRICT
      else out['district'] = district;
    }
    if (!provinceCode && city) out['province'] = city;
    Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
    return Object.keys(out).length ? out : undefined;
  }

  /** Service-level checks (identity checksum, tax office, address) so dry runs report them per row. */
  private async preflight(line: number, lang: Lang, partyType: string | null, input: Record<string, unknown>): Promise<ImportRowError[]> {
    const errors: ImportRowError[] = [];
    try {
      resolvePartyIdentity({ identityType: null, identityNumber: null }, input as any, partyType);
    } catch (e) {
      errors.push({ ...this.fromException(line, e, lang), field: 'identityNumber' });
    }
    try {
      if (input['taxOfficeCode']) await this.refdata.resolveTaxOffice(input['taxOfficeCode'] as string, null);
    } catch (e) {
      errors.push({ ...this.fromException(line, e, lang), field: 'taxOfficeCode' });
    }
    try {
      if (input['address']) await this.refdata.normalizeAddress(input['address'] as any, 'TR');
    } catch (e) {
      errors.push({ ...this.fromException(line, e, lang), field: 'address' });
    }
    return errors;
  }

  private get companyId() {
    return this.tenant.companyId;
  }

  // ------------------------------------------------------------------ export
  async exportProducts(): Promise<string> {
    const rows = await this.ds.getRepository(ProductEntity).find({ where: { companyId: this.companyId, isDeleted: false }, order: { sku: 'ASC' } });
    const cols = [...PRODUCT_CSV_COLUMNS, 'status', 'trackingType', 'id'];
    return toCsv(cols, rows as any);
  }

  async exportCustomers(): Promise<string> {
    const rows = await this.ds.getRepository(CustomerEntity).find({ where: { companyId: this.companyId, isDeleted: false }, order: { name: 'ASC' } });
    return toCsv(
      [...CUSTOMER_CSV_COLUMNS, 'province', 'needsReview', 'id'],
      rows.map((c) => ({ ...c, ...flatAddress(c.address) })) as any,
    );
  }

  async exportSuppliers(): Promise<string> {
    const rows = await this.ds.getRepository(SupplierEntity).find({ where: { companyId: this.companyId, isDeleted: false }, order: { name: 'ASC' } });
    return toCsv(
      [...SUPPLIER_CSV_COLUMNS, 'province', 'needsReview', 'id'],
      rows.map((s) => ({ ...s, ...flatAddress(s.address) })) as any,
    );
  }

  async exportOrders(): Promise<string> {
    const rows = await this.ds.getRepository(OrderEntity).find({ where: { companyId: this.companyId }, relations: ['items'], order: { date: 'DESC' } });
    const cols = ['orderNumber', 'date', 'status', 'customerName', 'customerId', 'currency', 'exchangeRate', 'subtotal', 'taxTotal', 'grandTotal', 'itemCount', 'carrier', 'trackingNumber', 'id'];
    return toCsv(cols, rows.map((o) => ({ ...o, itemCount: o.items?.length ?? 0 })) as any);
  }

  async exportStock(): Promise<string> {
    const rows = await this.ds.query(
      `SELECT p.sku, p.name, w.code AS warehouseCode, w.name AS warehouseName, s.quantity, p.minQuantity, p.unit, p.status
         FROM product_warehouse_stocks s
         JOIN products p ON p.id = s.productId AND p.companyId = s.companyId
         JOIN warehouses w ON w.id = s.warehouseId AND w.companyId = s.companyId
        WHERE s.companyId = ? AND p.isDeleted = 0
        ORDER BY p.sku, w.code`,
      [this.companyId],
    );
    return toCsv(['sku', 'name', 'warehouseCode', 'warehouseName', 'quantity', 'minQuantity', 'unit', 'status'], rows);
  }

  // ------------------------------------------------------------------ import helpers
  private parse(csv: string, required: string[]) {
    if (!csv || typeof csv !== 'string') throw new BadRequestException(err('IMPORT_EMPTY'));
    const { headers, rows } = parseCsvObjects(csv);
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length) throw new BadRequestException(err('IMPORT_MISSING_COLUMNS', { columns: missing.join(', ') }));
    if (!rows.length) throw new BadRequestException(err('IMPORT_EMPTY'));
    if (rows.length > MAX_ROWS) throw new BadRequestException(err('IMPORT_TOO_MANY_ROWS', { max: MAX_ROWS }));
    return rows;
  }

  private issue(row: number, code: string, lang: Lang, params: Record<string, any> = {}, field?: string): ImportRowError {
    return { row, field, code, message: translate(code, lang, params) };
  }

  private validationIssues(row: number, errors: ValidationError[], lang: Lang): ImportRowError[] {
    const out: ImportRowError[] = [];
    for (const e of errors) {
      for (const m of Object.values(e.constraints || {})) {
        const { code, params } = parseValidationMessage(m);
        out.push(this.issue(row, code, lang, { property: e.property, ...params }, e.property));
      }
    }
    return out;
  }

  private fromException(row: number, e: unknown, lang: Lang): ImportRowError {
    const body = e instanceof HttpException ? e.getResponse() : null;
    if (isCodedErrorBody(body)) return this.issue(row, body.code, lang, body.params || {});
    return this.issue(row, 'INTERNAL_ERROR', lang);
  }

  // ------------------------------------------------------------------ products
  /**
   * Upsert by SKU: new SKUs are created (with initial stock in the default warehouse),
   * existing SKUs get their catalog fields updated (quantity column is ignored for them).
   * Invalid rows are reported and skipped; valid rows are imported unless dryRun.
   */
  async importProducts(csv: string, dryRun: boolean, lang: Lang, performedBy: string): Promise<ImportReport> {
    const rows = this.parse(csv, ['sku', 'name', 'category', 'price']);
    const companyId = this.companyId;
    const [existing, categories, suppliers] = await Promise.all([
      this.ds.getRepository(ProductEntity).find({ where: { companyId, isDeleted: false }, select: ['id', 'sku'] }),
      this.ds.getRepository(CategoryEntity).find({ where: { companyId, isDeleted: false }, select: ['slug'] }),
      this.ds.getRepository(SupplierEntity).find({ where: { companyId, isDeleted: false }, select: ['id'] }),
    ]);
    const bySku = new Map(existing.map((p) => [p.sku, p.id]));
    const catSet = new Set(categories.map((c) => c.slug));
    const supSet = new Set(suppliers.map((s) => s.id));
    const seen = new Map<string, number>();
    const report: ImportReport = { dryRun, total: rows.length, valid: 0, invalid: 0, created: 0, updated: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const line = i + 2; // header is line 1
      const input: Record<string, unknown> = {
        sku: str(r['sku']),
        name: str(r['name']),
        category: str(r['category']),
        price: num(r['price']),
        quantity: num(r['quantity']) ?? 0,
        minQuantity: num(r['minQuantity']) ?? 0,
        unit: str(r['unit']),
        barcode: str(r['barcode']),
        barcodeType: str(r['barcodeType']),
        supplierId: str(r['supplierId']),
      };
      Object.keys(input).forEach((k) => input[k] === undefined && delete input[k]);
      const existingId = input['sku'] ? bySku.get(input['sku'] as string) : undefined;
      const rowErrors: ImportRowError[] = [];
      const dtoClass = existingId ? UpdateProductDto : CreateProductDto;
      const payload = existingId ? { ...input, quantity: undefined } : input;
      rowErrors.push(...this.validationIssues(line, await validate(plainToInstance(dtoClass, payload) as object, { whitelist: true }), lang));
      const sku = input['sku'] as string | undefined;
      if (sku) {
        if (seen.has(sku)) rowErrors.push(this.issue(line, 'IMPORT_DUPLICATE_ROW', lang, { value: sku, row: seen.get(sku) }, 'sku'));
        else seen.set(sku, line);
      }
      if (input['category'] && !catSet.has(input['category'] as string)) {
        rowErrors.push(this.issue(line, 'PRODUCT_INVALID_CATEGORY', lang, { category: input['category'] as string }, 'category'));
      }
      if (input['supplierId'] && !supSet.has(input['supplierId'] as string)) {
        rowErrors.push(this.issue(line, 'PRODUCT_INVALID_SUPPLIER', lang, { id: input['supplierId'] as string }, 'supplierId'));
      }
      if (rowErrors.length) {
        report.invalid++;
        report.errors.push(...rowErrors);
        continue;
      }
      report.valid++;
      if (dryRun) {
        existingId ? report.updated++ : report.created++;
        continue;
      }
      try {
        if (existingId) {
          const { quantity, ...updates } = input;
          await this.products.updateProduct(existingId, updates as any, performedBy);
          report.updated++;
        } else {
          const created = await this.products.createProduct(input as any, performedBy);
          bySku.set(created.sku, created.id);
          report.created++;
        }
      } catch (e) {
        report.valid--;
        report.invalid++;
        report.errors.push(this.fromException(line, e, lang));
      }
    }
    return report;
  }

  // ------------------------------------------------------------------ customers
  /**
   * Customers are matched by e-mail (case-insensitive) when present; otherwise created.
   * Accepts the WP1 columns and the legacy taxNumber / address / city columns.
   */
  async importCustomers(csv: string, dryRun: boolean, lang: Lang): Promise<ImportReport> {
    const rows = this.parse(csv, ['name']);
    const existing = await this.ds.getRepository(CustomerEntity).find({ where: { companyId: this.companyId, isDeleted: false }, select: ['id', 'email'] });
    const byEmail = new Map(existing.filter((c) => c.email).map((c) => [String(c.email).toLowerCase(), c.id]));
    const seen = new Map<string, number>();
    const report: ImportReport = { dryRun, total: rows.length, valid: 0, invalid: 0, created: 0, updated: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const line = i + 2;
      const input: Record<string, unknown> = {};
      for (const col of ['name', 'type', 'identityType', 'identityNumber', 'taxOfficeCode', 'taxOfficeName', 'email', 'phone', 'currency', 'notes', 'taxNumber']) {
        const v = str(r[col]);
        if (v !== undefined) input[col] = v;
      }
      for (const col of ['isVatTaxpayer', 'isDesignatedBuyer']) {
        const v = bool(r[col]);
        if (v !== undefined) input[col] = v;
      }
      const address = await this.csvAddress(r, true);
      if (address) input['address'] = address;
      const dto = plainToInstance(CreateCustomerDto, input);
      const rowErrors = this.validationIssues(line, await validate(dto as object, { whitelist: true }), lang);
      if (!rowErrors.length) rowErrors.push(...(await this.preflight(line, lang, (input['type'] as string) || 'individual', input)));
      const email = typeof input['email'] === 'string' ? (input['email'] as string).toLowerCase() : undefined;
      if (email) {
        if (seen.has(email)) rowErrors.push(this.issue(line, 'IMPORT_DUPLICATE_ROW', lang, { value: email, row: seen.get(email) }, 'email'));
        else seen.set(email, line);
      }
      if (rowErrors.length) {
        report.invalid++;
        report.errors.push(...rowErrors);
        continue;
      }
      report.valid++;
      const existingId = email ? byEmail.get(email) : undefined;
      if (dryRun) {
        existingId ? report.updated++ : report.created++;
        continue;
      }
      try {
        if (existingId) {
          await this.customers.updateCustomer(existingId, plainToInstance(UpdateCustomerDto, input));
          report.updated++;
        } else {
          const c = await this.customers.createCustomer(dto);
          if (email) byEmail.set(email, c.id);
          report.created++;
        }
      } catch (e) {
        report.valid--;
        report.invalid++;
        report.errors.push(this.fromException(line, e, lang));
      }
    }
    return report;
  }

  // ------------------------------------------------------------------ suppliers
  /** Suppliers are matched by name (case-insensitive); otherwise created. */
  async importSuppliers(csv: string, dryRun: boolean, lang: Lang): Promise<ImportReport> {
    const rows = this.parse(csv, ['name']);
    const existing = await this.ds.getRepository(SupplierEntity).find({ where: { companyId: this.companyId, isDeleted: false }, select: ['id', 'name'] });
    const byName = new Map(existing.map((s) => [trKey(s.name), s.id]));
    const seen = new Map<string, number>();
    const report: ImportReport = { dryRun, total: rows.length, valid: 0, invalid: 0, created: 0, updated: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const line = i + 2;
      const input: Record<string, unknown> = {};
      for (const col of ['name', 'type', 'identityType', 'identityNumber', 'taxOfficeCode', 'taxOfficeName', 'contactPerson', 'email', 'phone', 'notes']) {
        const v = str(r[col]);
        if (v !== undefined) input[col] = v;
      }
      for (const col of ['isTaxpayer', 'isVatTaxpayer', 'isForeign', 'isRealTaxationFarmer']) {
        const v = bool(r[col]);
        if (v !== undefined) input[col] = v;
      }
      for (const col of ['rating', 'leadTimeDays']) {
        const v = num(r[col]);
        if (v !== undefined) input[col] = v;
      }
      const address = await this.csvAddress(r);
      if (address) input['address'] = address;
      const dto = plainToInstance(CreateSupplierDto, input);
      const rowErrors = this.validationIssues(line, await validate(dto as object, { whitelist: true }), lang);
      const type = (input['type'] as string) || 'company';
      const partyType = input['isForeign'] === true ? null : type === 'individual' ? 'individual' : 'company';
      if (!rowErrors.length) rowErrors.push(...(await this.preflight(line, lang, partyType, input)));
      const key = trKey(input['name'] as string);
      if (key) {
        if (seen.has(key)) rowErrors.push(this.issue(line, 'IMPORT_DUPLICATE_ROW', lang, { value: input['name'] as string, row: seen.get(key) }, 'name'));
        else seen.set(key, line);
      }
      if (rowErrors.length) {
        report.invalid++;
        report.errors.push(...rowErrors);
        continue;
      }
      report.valid++;
      const existingId = byName.get(key);
      if (dryRun) {
        existingId ? report.updated++ : report.created++;
        continue;
      }
      try {
        if (existingId) {
          await this.suppliers.updateSupplier(existingId, plainToInstance(UpdateSupplierDto, input));
          report.updated++;
        } else {
          const created = await this.suppliers.createSupplier(dto);
          byName.set(key, created.id);
          report.created++;
        }
      } catch (e) {
        report.valid--;
        report.invalid++;
        report.errors.push(this.fromException(line, e, lang));
      }
    }
    return report;
  }
}
