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
import { CreateCustomerDto } from '../../dto/customer.dto';
import { ProductService } from '../product/product.service';
import { CustomerService } from '../customer/customer.service';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { Lang, translate } from '../../shared/i18n/messages';
import { isCodedErrorBody } from '../../shared/i18n/app-error';
import { parseValidationMessage } from '../../shared/i18n/i18n-exception.filter';
import { parseCsvObjects, toCsv } from '../../shared/integrations/csv';

export const PRODUCT_CSV_COLUMNS = ['sku', 'name', 'category', 'price', 'quantity', 'minQuantity', 'unit', 'barcode', 'barcodeType', 'supplierId'];
export const CUSTOMER_CSV_COLUMNS = ['name', 'type', 'email', 'phone', 'taxNumber', 'country', 'address', 'city', 'postalCode', 'currency', 'notes'];
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

@Injectable()
export class ImportExportService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly tenant: TenantContext,
    private readonly products: ProductService,
    private readonly customers: CustomerService,
  ) {}

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
    return toCsv([...CUSTOMER_CSV_COLUMNS, 'id'], rows as any);
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
  /** Customers are matched by e-mail (case-insensitive) when present; otherwise created. */
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
      for (const col of CUSTOMER_CSV_COLUMNS) {
        const v = str(r[col]);
        if (v !== undefined) input[col] = v;
      }
      const dto = plainToInstance(CreateCustomerDto, input);
      const rowErrors = this.validationIssues(line, await validate(dto as object, { whitelist: true }), lang);
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
          await this.customers.updateCustomer(existingId, dto);
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
}
