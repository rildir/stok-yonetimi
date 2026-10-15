import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { ProductEntity } from '../../entities/product.entity';
import { ProductPriceHistoryEntity } from '../../entities/inventory-accounting.entity';
import { FinanceService } from '../../shared/services/finance.service';
import { discountReferencePrice } from '../../shared/inventory/price-reference';
import { roundMoney } from '../../shared/inventory/costing';
import { toCsv } from '../../shared/integrations/csv';
import { dateKeyInZone, DEFAULT_TIMEZONE, isValidGtin } from '../../shared/tr';
import { esc, money, trDay } from './legal-print';

/** EAN-13 bar pattern (GS1 GenSpecs 5.2.1.2). */
const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

/** Inline SVG of an EAN-13 (null when the code is not a valid GTIN-13). */
export function ean13Svg(code: string, height = 40): string | null {
  if (!/^\d{13}$/.test(code) || !isValidGtin(code)) return null;
  const d = code.split('').map(Number);
  let bits = '101';
  for (let i = 1; i <= 6; i++) bits += (PARITY[d[0]][i - 1] === 'L' ? L : G)[d[i]];
  bits += '01010';
  for (let i = 7; i <= 12; i++) bits += R[d[i]];
  bits += '101';
  const w = 1.4;
  const rects = bits
    .split('')
    .map((b, i) => (b === '1' ? `<rect x="${(i + 9) * w}" y="0" width="${w}" height="${height}"/>` : ''))
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${(bits.length + 18) * w}" height="${height + 12}" viewBox="0 0 ${(bits.length + 18) * w} ${height + 12}"><g fill="#000">${rects}</g><text x="${((bits.length + 18) * w) / 2}" y="${height + 11}" font-size="10" text-anchor="middle" font-family="monospace">${code}</text></svg>`;
}

const UNIT_LABEL: Record<string, string> = { kg: 'kg', l: 'L', m: 'm', m2: 'm²', adet: 'adet' };

const PRICE_CSV_HEADERS_TR: Record<string, string> = {
  sku: 'Stok kodu',
  name: 'Ürün adı',
  currency: 'Para birimi',
  netPrice: 'Net fiyat',
  vatRate: 'KDV oranı (%)',
  grossPrice: 'KDV dahil fiyat',
  unitPrice: 'Birim fiyat',
  unit: 'Birim',
  lastChange: 'Son fiyat değişikliği',
  originCountry: 'Menşe ülke',
  barcode: 'Barkod',
};

/**
 * Prices (Fiyat Etiketi Yönetmeliği; R70): price history, the reference ("indirimden önceki")
 * price of a discount (lowest price of the last DISCOUNT_REFERENCE_DAYS days; previous price for
 * perishable goods), shelf labels with the VAT-inclusive price, the unit price per kg / L, the
 * date of the last change (GG.AA.YYYY), barcode and the domestic production logo for goods of
 * Turkish origin, and the price list as Turkish-formatted CSV.
 */
@Injectable()
export class PriceService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly finance: FinanceService,
  ) {}

  private get companyId(): string {
    return this.tenant.companyId;
  }

  /** Records a price change (called by ProductService when the price / currency changes). */
  static async record(manager: EntityManager, product: Pick<ProductEntity, 'id' | 'companyId' | 'price' | 'currency'>, changedBy: string | null, priceInclTax: number | null = null, source = 'PRODUCT_UPDATE'): Promise<void> {
    if (typeof (manager as any).save !== 'function' || typeof (manager as any).create !== 'function') return;
    await manager.save(ProductPriceHistoryEntity, manager.create(ProductPriceHistoryEntity, {
      companyId: product.companyId,
      productId: product.id,
      price: Number(product.price) || 0,
      currency: product.currency || 'TRY',
      priceInclTax,
      validFrom: new Date(Math.floor(Date.now() / 1000) * 1000),
      source,
      changedBy: changedBy ? changedBy.slice(0, 100) : null,
    }));
  }

  async history(productId: string) {
    return this.dataSource.manager.find(ProductPriceHistoryEntity, { where: { companyId: this.companyId, productId }, order: { validFrom: 'DESC' }, take: 100 });
  }

  /** Price incl. VAT (consumer price) of a product's current price. */
  private async grossPrice(p: ProductEntity, company: CompanyEntity): Promise<{ net: number; gross: number; rate: number }> {
    const rate = await this.finance.taxRateForProduct(p).catch(() => 20);
    const price = Number(p.price) || 0;
    if (company.pricesIncludeTax) return { net: roundMoney(price / (1 + rate / 100)), gross: roundMoney(price), rate };
    return { net: roundMoney(price), gross: roundMoney(price * (1 + rate / 100)), rate };
  }

  async reference(productId: string, at?: string) {
    const m = this.dataSource.manager;
    const p = await m.findOne(ProductEntity, { where: { companyId: this.companyId, id: productId } });
    if (!p) throw new NotFoundException(err('PRODUCT_NOT_FOUND'));
    const days = Number(await this.finance.param<number>('DISCOUNT_REFERENCE_DAYS').catch(() => 10)) || 10;
    const history = await m.find(ProductPriceHistoryEntity, { where: { companyId: this.companyId, productId }, order: { validFrom: 'ASC' } });
    // The reference of the current price is taken at the moment that price took effect (the discount).
    // Start of the current price streak (consecutive rows with the current price, newest first).
    let current: ProductPriceHistoryEntity | undefined;
    for (const h of [...history].reverse()) {
      if (Number(h.price) === Number(p.price) && h.currency === p.currency) current = h;
      else if (current) break;
    }
    const when = at ? new Date(at) : current ? new Date(current.validFrom) : new Date();
    if (Number.isNaN(when.getTime())) throw new BadRequestException(err('DOCUMENT_DATE_INVALID'));
    const ref = discountReferencePrice(history.map((h) => ({ price: Number(h.price), validFrom: h.validFrom })), when, { days, perishable: !!p.perishable });
    return { productId, currentPrice: Number(p.price), currency: p.currency, days, perishable: !!p.perishable, priceSince: current ? current.validFrom : null, ...ref, isDiscounted: ref.referencePrice !== null && Number(p.price) < ref.referencePrice };
  }

  /** Shelf labels (printable, 3 per row on A4). */
  async labelsHtml(productIds: string[]): Promise<string> {
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const tz = company.timezone || DEFAULT_TIMEZONE;
    const products = productIds.length ? await m.find(ProductEntity, { where: { companyId: this.companyId, id: In(productIds) } }) : [];
    if (!products.length) throw new BadRequestException(err('LABEL_PRODUCTS_REQUIRED'));
    const cards: string[] = [];
    for (const p of products) {
      const { gross } = await this.grossPrice(p, company);
      const last = await m.findOne(ProductPriceHistoryEntity, { where: { companyId: this.companyId, productId: p.id }, order: { validFrom: 'DESC' } });
      const changed = last ? dateKeyInZone(new Date(last.validFrom), tz) : dateKeyInZone(new Date(p.updatedAt || p.createdAt), tz);
      const ref = await this.reference(p.id);
      const net = Number(p.labelNetQuantity) || 0;
      const unitPrice = net > 0 && p.labelNetUnit ? roundMoney(gross / net) : null;
      const code = p.barcode && /^\d{13}$/.test(p.barcode) ? p.barcode : p.gtin14 && p.gtin14.startsWith('0') ? p.gtin14.slice(1) : null;
      const svg = code ? ean13Svg(code) : null;
      const refGross = ref.referencePrice !== null && ref.isDiscounted ? (company.pricesIncludeTax ? ref.referencePrice : roundMoney(ref.referencePrice * (1 + (await this.finance.taxRateForProduct(p).catch(() => 20)) / 100))) : null;
      cards.push(`<div class="lbl">
        ${p.originCountry === 'TR' ? '<div class="yerli" title="Yerli Üretim">YERLİ<br>ÜRETİM</div>' : ''}
        <div class="nm">${esc(p.name)}</div>
        ${refGross !== null ? `<div class="old">Önceki fiyat: <s>${money(refGross, p.currency)}</s></div>` : ''}
        <div class="pr">${money(gross, p.currency)}</div>
        <div class="sub">KDV dahil${unitPrice !== null ? ` &middot; Birim fiyat: ${money(unitPrice, p.currency)} / ${esc(UNIT_LABEL[p.labelNetUnit || ''] || p.labelNetUnit)}` : ''}</div>
        <div class="row"><span>${esc(p.sku || '')}</span><span>Değişiklik: ${trDay(changed)}</span></div>
        ${p.originCountry ? `<div class="sub">Menşe: ${esc(p.originCountry)}</div>` : ''}
        <div class="bc">${svg || (code ? esc(code) : '')}</div></div>`);
    }
    return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Raf etiketi</title><style>
      @page { size: A4; margin: 8mm; } body { font: 12px "Segoe UI", Arial, sans-serif; margin: 0; padding: 8px; }
      .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; }
      .lbl { position: relative; border: 1px solid #333; border-radius: 4px; padding: 6px 8px; min-height: 48mm; page-break-inside: avoid; }
      .nm { font-weight: 700; font-size: 13px; margin-right: 44px; min-height: 32px; } .pr { font-size: 26px; font-weight: 800; margin-top: 4px; }
      .old { color: #555; font-size: 11px; } .sub { font-size: 10px; color: #333; } .row { display: flex; justify-content: space-between; font-size: 10px; margin-top: 4px; }
      .bc { margin-top: 4px; text-align: center; } .bc svg { max-width: 100%; height: auto; }
      .yerli { position: absolute; top: 6px; right: 6px; width: 40px; height: 40px; border-radius: 50%; border: 2px solid #c00; color: #c00; font-size: 8px; font-weight: 800; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.05; }
    </style></head><body><div class="grid">${cards.join('')}</div></body></html>`;
  }

  /** Price list CSV (locale 'tr': ';' + decimal comma + BOM). */
  async priceListCsv(locale: 'tr' | 'en' = 'tr'): Promise<string> {
    const m = this.dataSource.manager;
    const company = await m.findOneByOrFail(CompanyEntity, { id: this.companyId });
    const tz = company.timezone || DEFAULT_TIMEZONE;
    const products = await m.find(ProductEntity, { where: { companyId: this.companyId, isDeleted: false }, order: { sku: 'ASC' } });
    const rows: Record<string, unknown>[] = [];
    for (const p of products) {
      const { net, gross, rate } = await this.grossPrice(p, company);
      const last = await m.findOne(ProductPriceHistoryEntity, { where: { companyId: this.companyId, productId: p.id }, order: { validFrom: 'DESC' } });
      const qty = Number(p.labelNetQuantity) || 0;
      const amount = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? '' : Number(v).toFixed(2));
      rows.push({
        sku: p.sku,
        name: p.name,
        currency: p.currency,
        netPrice: amount(net),
        vatRate: rate,
        grossPrice: amount(gross),
        unitPrice: qty > 0 ? amount(roundMoney(gross / qty)) : '',
        unit: p.labelNetUnit || '',
        lastChange: last ? trDay(dateKeyInZone(new Date(last.validFrom), tz)) : '',
        originCountry: p.originCountry || '',
        barcode: p.barcode || '',
      });
    }
    const keys = ['sku', 'name', 'currency', 'netPrice', 'vatRate', 'grossPrice', 'unitPrice', 'unit', 'lastChange', 'originCountry', 'barcode'];
    // Turkish Excel users get Turkish column titles; the English file keeps the machine-readable keys.
    const labels = locale === 'tr' ? PRICE_CSV_HEADERS_TR : undefined;
    return toCsv(keys, rows, locale, labels);
  }
}
