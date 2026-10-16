import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { TenantContext } from '../../shared/tenant/tenant-context.service';
import { CompanyEntity } from '../../entities/company.entity';
import { OrderEntity } from '../../entities/order.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { UnitEntity } from '../../entities/unit.entity';
import { PartySnapshot } from '../../entities/document-common';
import { formatAddress } from '../../entities/address.embedded';
import { NOT_FISCAL_DOCUMENT_TEXT, REPLACES_DESPATCH_TEXT, dateKeyInZone, timeKeyInZone } from '../../shared/tr';
import { DespatchService } from './despatch.service';
import { InvoiceService } from './invoice.service';
import { ReturnService } from './return.service';
import { GoodsReceiptService } from './goods-receipt.service';
import { ExpenseVoucherService } from './expense-voucher.service';
import { companySnapshot } from './document-support';
import { demoBannerHtml } from '../../shared/demo';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const money = (v: unknown, cur = 'TRY') => `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v) || 0)} ${cur === 'TRY' ? 'TL' : cur}`;
const qty = (v: unknown) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 4 }).format(Number(v) || 0);
const day = (v: unknown) => (v ? String(v).slice(0, 10).split('-').reverse().join('.') : '-');

const PURPOSES: Record<string, string> = {
  SALE: 'Satış', TRANSFER: 'Depolar arası transfer', CONSIGNMENT: 'Konsinye', REPAIR: 'Tamir', SAMPLE: 'Numune', SUBCONTRACT: 'Fason', RETURN: 'İade', PURCHASE_PICKUP: 'Alış (alıcı taşıması)',
};
const STATUS: Record<string, string> = {
  DRAFT: 'TASLAK', APPROVED: 'Onaylandı', ISSUED: 'Düzenlendi', CANCELLED: 'İPTAL EDİLDİ', COMPLETED: 'Tamamlandı', HANDED_TO_PROVIDER: 'Entegratöre iletildi',
  GIB_ACCEPTED: 'GİB kabul', REJECTED: 'Reddedildi', PARTIALLY_ACCEPTED: 'Kısmi kabul', QUEUED: 'Kuyrukta', SENT: 'Gönderildi', DELIVERED: 'Teslim edildi', ACCEPTED: 'Kabul edildi',
};
const RETURN_TYPES: Record<string, string> = { SALES_RETURN: 'Satış iadesi', PURCHASE_RETURN: 'Alış iadesi', WITHDRAWAL: 'Cayma (mesafeli satış)', DEFECT: 'Ayıplı mal iadesi' };

/** Turkish names of the UN/ECE codes used on document lines when the company has no unit row for them. */
const UNECE_TR: Record<string, string> = { C62: 'Adet', KGM: 'kg', GRM: 'g', LTR: 'L', MLT: 'mL', MTR: 'm', BX: 'Kutu', PK: 'Paket', PA: 'Paket', PF: 'Palet', LBR: 'lb', SET: 'Takım' };

/**
 * Printable HTML of documents and non-fiscal outputs (saved as PDF from the browser). Always Turkish
 * (VUK 215/1), whatever the UI language. Every output carries the mandatory "Mali değeri yoktur..."
 * wording (VUK 353, 7524 s.K.): the app never prints a legal invoice / despatch advice itself. The
 * legal document is the pre-printed matbu form (PAPER numbers mirror its serial number), the
 * document issued on the GİB portal / by the integrator (EXTERNAL), or the e-document image (WP5);
 * the app prints an information copy of it.
 */
@Injectable()
export class DocumentPrintService {
  constructor(
    private readonly tenant: TenantContext,
    private readonly dataSource: DataSource,
    private readonly despatches: DespatchService,
    private readonly invoices: InvoiceService,
    private readonly returns: ReturnService,
    private readonly receipts: GoodsReceiptService,
    private readonly vouchers: ExpenseVoucherService,
  ) {}

  /** Unit code (product unit code or UN/ECE code) -> Turkish unit name for printing. */
  private async unitNames(): Promise<(code?: string | null) => string> {
    const rows = await this.dataSource.manager.find(UnitEntity, { where: { companyId: this.tenant.companyId }, order: { isStandard: 'DESC' } });
    const map = new Map<string, string>(Object.entries(UNECE_TR));
    const byUnece = new Set<string>();
    for (const u of rows) {
      map.set(u.code, u.name);
      if (u.uneceCode && !byUnece.has(u.uneceCode)) {
        map.set(u.uneceCode, u.name);
        byUnece.add(u.uneceCode);
      }
    }
    return (code) => (code ? map.get(code) ?? code : '');
  }

  /** Line under the title of an information copy: where the legal document is. */
  private legalSource(numberMode: string | null | undefined, documentNo: string | null | undefined, kind: string, genitive: string): string {
    if (numberMode === 'PAPER') return `${genitive} yasal nüshası ${esc(documentNo)} seri-sıra numaralı matbu formdur; bu çıktı bilgi nüshasıdır.`;
    if (numberMode === 'EXTERNAL') return `${kind} GİB portalında / entegratörde ${esc(documentNo)} numarasıyla düzenlenmiştir; bu çıktı kayıt nüshasıdır.`;
    if (numberMode === 'EDOCUMENT') return `${genitive} yasal görüntüsü e-Belge sağlayıcısındadır; bu çıktı önizlemedir.`;
    return '';
  }

  private async company(): Promise<CompanyEntity> {
    return this.dataSource.manager.findOneOrFail(CompanyEntity, { where: { id: this.tenant.companyId } });
  }

  private party(title: string, p?: PartySnapshot | null): string {
    if (!p) return '';
    const id = p.taxId ? `${p.taxIdType === 'TCKN' ? 'TCKN' : p.taxIdType === 'FOREIGN' ? 'Vergi No' : 'VKN'}: ${esc(p.taxId)}` : '';
    return `<div class="party"><div class="lbl">${esc(title)}</div><b>${esc(p.legalName || p.name)}</b><div>${esc(p.addressText || formatAddress(p.address as any))}</div>
      <div>${id}${p.taxOfficeName ? ` &middot; Vergi Dairesi: ${esc(p.taxOfficeName)}` : ''}</div>${p.mersisNo ? `<div>MERSİS: ${esc(p.mersisNo)}</div>` : ''}${p.tradeRegistryNo ? `<div>Ticaret Sicil No: ${esc(p.tradeRegistryNo)}</div>` : ''}${p.website ? `<div>${esc(p.website)}</div>` : ''}</div>`;
  }

  private page(title: string, body: string, opts: { notFiscal: boolean; watermark?: string | null }): string {
    return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      @page { size: A4; margin: 14mm; } body { font: 12px/1.45 "Segoe UI", Arial, sans-serif; color: #111; margin: 0; padding: 16px; }
      h1 { font-size: 18px; margin: 0 0 4px; } .muted { color: #555; } .grid { display: flex; gap: 16px; justify-content: space-between; margin: 12px 0; }
      .party { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; } .lbl { font-size: 10px; text-transform: uppercase; color: #666; letter-spacing: .04em; }
      table { width: 100%; border-collapse: collapse; margin-top: 10px; } th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; vertical-align: top; } th { background: #f3f3f3; font-size: 11px; }
      td.n, th.n { text-align: right; white-space: nowrap; } .meta td { border: none; padding: 1px 6px 1px 0; } .totals { margin-left: auto; width: 320px; } .totals td { border: none; border-bottom: 1px solid #eee; }
      .notice { margin-top: 14px; padding: 8px 10px; border: 2px solid #b00; color: #b00; font-weight: 700; text-align: center; } .ibare { margin-top: 10px; font-weight: 700; }
      .wm { position: fixed; top: 40%; left: 0; right: 0; text-align: center; font-size: 72px; color: rgba(200,0,0,.12); transform: rotate(-20deg); pointer-events: none; }
      .sign { display: flex; gap: 24px; margin-top: 32px; } .sign div { flex: 1; border-top: 1px solid #999; padding-top: 4px; text-align: center; color: #555; }
    </style></head><body>${demoBannerHtml()}${opts.watermark ? `<div class="wm">${esc(opts.watermark)}</div>` : ''}${opts.notFiscal ? `<div class="notice">${esc(NOT_FISCAL_DOCUMENT_TEXT)}</div>` : ''}${body}${opts.notFiscal ? `<div class="notice">${esc(NOT_FISCAL_DOCUMENT_TEXT)}</div>` : ''}</body></html>`;
  }

  async despatch(id: string): Promise<string> {
    const d = await this.despatches.get(id);
    const company = await this.company();
    const unit = await this.unitNames();
    const drivers = (d.drivers || []).map((x) => `${esc(x.firstName)} ${esc(x.lastName)} (TCKN ${esc(x.tckn)})`).join(', ') || '-';
    const plates = (d.plates || []).map((p) => esc(p.plate)).join(', ') || '-';
    const rows = d.lines.map((l) => `<tr><td>${l.lineNo}</td><td>${esc(l.productSku || '')}</td><td>${esc(l.productName)}${(l.tracking || []).filter((t) => t.lotNumber).map((t) => `<div class="muted">Parti: ${esc(t.lotNumber)}${t.expiryDate ? ` · SKT ${day(t.expiryDate)}` : ''}</div>`).join('')}${(l.tracking || []).flatMap((t) => t.serials || []).length ? `<div class="muted">Seri: ${esc((l.tracking || []).flatMap((t) => t.serials || []).join(', '))}</div>` : ''}</td><td class="n">${qty(l.quantity)}</td><td>${esc(unit(l.unitCode))}</td></tr>`).join('');
    const refs = (d.invoiceRefs || []).map((r) => `${esc(r.documentNo)} (${day(r.issueDate)})`).join(', ');
    const source = d.status === 'DRAFT' ? '' : this.legalSource(d.numberMode, d.documentNo, 'İrsaliye', 'İrsaliyenin');
    const body = `<h1>SEVK İRSALİYESİ (BİLGİ NÜSHASI)</h1><div class="muted">${esc(PURPOSES[d.purpose] || d.purpose)} · ${esc(STATUS[d.status] || d.status)}${d.typeCode === 'MATBUDAN' ? ' · MATBUDAN' : ''}</div>${source ? `<div class="muted">${source}</div>` : ''}
      <table class="meta"><tr><td>İrsaliye No:</td><td><b>${esc(d.documentNo || '(onayda verilir)')}</b></td><td>Düzenleme:</td><td>${day(d.issueDate)} ${esc(d.issueTime || '')}</td></tr>
      <tr><td>Fiili sevk:</td><td>${d.actualDespatchAt ? `${day(dateKeyInZone(new Date(d.actualDespatchAt), company.timezone))} ${timeKeyInZone(new Date(d.actualDespatchAt), company.timezone).slice(0, 5)}` : '-'}</td><td>ETTN:</td><td>${esc(d.ettn)}</td></tr>
      ${d.orderNumber ? `<tr><td>Sipariş:</td><td>${esc(d.orderNumber)}</td><td></td><td></td></tr>` : ''}${refs ? `<tr><td>Fatura:</td><td colspan="3">${refs}</td></tr>` : ''}
      ${d.paperNo ? `<tr><td>Kâğıt irsaliye:</td><td>${esc(d.paperNo)} (${day(d.paperDate)})</td><td>Gerekçe (509 V.7):</td><td>${esc(d.paperReason)}</td></tr>` : ''}</table>
      <div class="grid">${this.party('Gönderen', d.sellerSnapshot)}${this.party('Alıcı', d.buyerSnapshot)}</div>
      <table class="meta"><tr><td>Sevk adresi:</td><td>${esc(formatAddress(d.originAddress as any) || '-')}</td></tr><tr><td>Teslimat adresi:</td><td>${esc(formatAddress(d.deliveryAddress as any) || '-')}</td></tr>
      <tr><td>Taşıyıcı:</td><td>${esc(d.carrierParty?.name || '-')}${d.carrierParty?.taxId ? ` (VKN ${esc(d.carrierParty.taxId)})` : ''}</td></tr><tr><td>Sürücü:</td><td>${drivers}</td></tr><tr><td>Plaka:</td><td>${plates}</td></tr></table>
      <table><thead><tr><th>#</th><th>Stok kodu</th><th>Mal / hizmet</th><th class="n">Miktar</th><th>Birim</th></tr></thead><tbody>${rows}</tbody></table>
      ${d.note ? `<p>${esc(d.note)}</p>` : ''}<div class="sign"><div>Teslim eden</div><div>Teslim alan</div></div>`;
    return this.page(`İrsaliye ${d.documentNo || 'taslak'}`, body, { notFiscal: true, watermark: d.status === 'DRAFT' ? 'TASLAK' : null });
  }

  async invoice(id: string): Promise<string> {
    const inv = await this.invoices.get(id);
    const unit = await this.unitNames();
    const rows = inv.lines.map((l) => `<tr><td>${l.lineNo}</td><td>${esc(l.productName)}</td><td class="n">${qty(l.quantity)} ${esc(unit(l.unitCode))}</td><td class="n">${money(l.unitPrice, inv.currency)}</td><td class="n">${money(l.discountAmount, inv.currency)}</td><td class="n">%${qty(l.taxRate)}${l.exemptionCode ? ` (${esc(l.exemptionCode)})` : ''}${l.withholdingCode ? `<div class="muted">Tevkifat ${esc(l.withholdingCode)}</div>` : ''}</td><td class="n">${money(l.netAmount, inv.currency)}</td></tr>`).join('');
    const breakdown = (inv.taxBreakdown || []).map((b) => `<tr><td>KDV %${qty(b.rate)}${b.exemptionCode ? ` (${esc(b.exemptionCode)})` : ''} matrah ${money(b.base, inv.currency)}</td><td class="n">${money(b.tax, inv.currency)}</td></tr>`).join('');
    const despatchRefs = (inv.despatchRefs || []).map((r) => `${esc(r.documentNo)} (${day(r.issueDate)})`).join(', ');
    const billing = (inv.billingReferences || []).map((r) => `${esc(r.documentNo)} (${day(r.issueDate)})`).join(', ');
    const isi = inv.internetSaleInfo;
    const source = inv.status === 'DRAFT' ? '' : this.legalSource(inv.numberMode, inv.documentNo, 'Fatura', 'Faturanın');
    const body = `<h1>${inv.kind === 'RETURN' ? 'İADE FATURASI' : 'FATURA'} (BİLGİ NÜSHASI)</h1><div class="muted">${esc(inv.profileId)} · ${esc(inv.typeCode)} · ${esc(STATUS[inv.status] || inv.status)}</div>${source ? `<div class="muted">${source}</div>` : ''}
      <table class="meta"><tr><td>Fatura No:</td><td><b>${esc(inv.documentNo || '(düzenlemede verilir)')}</b></td><td>Düzenleme tarihi / saati:</td><td>${day(inv.issueDate)} ${esc(inv.issueTime || '')}</td></tr>
      <tr><td>ETTN:</td><td>${esc(inv.ettn)}</td><td>Teslim tarihi:</td><td>${day(inv.deliveryDate)}</td></tr>
      ${despatchRefs ? `<tr><td>İrsaliye:</td><td colspan="3">${despatchRefs}</td></tr>` : ''}${billing ? `<tr><td>İade edilen fatura:</td><td colspan="3">${billing}</td></tr>` : ''}
      ${inv.currency !== 'TRY' ? `<tr><td>Döviz kuru:</td><td colspan="3">1 ${esc(inv.currency)} = ${qty(inv.exchangeRate)} TL (${esc(inv.exchangeRateSource || '')} ${day(inv.exchangeRateDate)})</td></tr>` : ''}</table>
      <div class="grid">${this.party('Satıcı', inv.sellerSnapshot)}${this.party('Alıcı', inv.buyerSnapshot)}</div>
      <table><thead><tr><th>#</th><th>Mal / hizmet</th><th class="n">Miktar</th><th class="n">Birim fiyat</th><th class="n">İskonto</th><th class="n">KDV</th><th class="n">Tutar</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="totals"><tr><td>Mal / hizmet toplamı (matrah)</td><td class="n">${money(inv.subtotal, inv.currency)}</td></tr>${breakdown}
      ${inv.otvTotal ? `<tr><td>ÖTV</td><td class="n">${money(inv.otvTotal, inv.currency)}</td></tr>` : ''}<tr><td><b>Vergiler dahil toplam</b></td><td class="n"><b>${money(inv.grandTotal, inv.currency)}</b></td></tr>
      ${inv.withheldTaxTotal ? `<tr><td>Tevkif edilen KDV</td><td class="n">${money(inv.withheldTaxTotal, inv.currency)}</td></tr><tr><td><b>Ödenecek tutar</b></td><td class="n"><b>${money(inv.payableTotal, inv.currency)}</b></td></tr>` : ''}
      ${inv.currency !== 'TRY' ? `<tr><td>TL karşılığı</td><td class="n">${money(inv.grandTotalTry)}</td></tr>` : ''}</table>
      ${isi ? `<p class="muted">İnternet satışı: ${esc(isi.webAddress || '')} · Ödeme: ${esc(isi.paymentMethod || '-')} ${day(isi.paymentDate)} · Taşıyıcı: ${esc(isi.carrierName || '-')}${isi.carrierTaxId ? ` (VKN ${esc(isi.carrierTaxId)})` : ''} · Gönderim: ${day(isi.shipmentDate)}</p>` : ''}
      ${inv.replacesDespatch ? `<div class="ibare">${esc(REPLACES_DESPATCH_TEXT)}</div>` : ''}${inv.status === 'CANCELLED' ? `<p><b>İptal gerekçesi:</b> ${esc(inv.cancelReason)}</p>` : ''}`;
    return this.page(`Fatura ${inv.documentNo || 'taslak'}`, body, { notFiscal: true, watermark: inv.status === 'DRAFT' ? 'TASLAK' : inv.status === 'CANCELLED' ? 'İPTAL' : null });
  }

  async returnDoc(id: string): Promise<string> {
    const r = await this.returns.get(id);
    const unit = await this.unitNames();
    const rows = r.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.productName)}</td><td class="n">${qty(i.quantity)} ${esc(unit(i.unitCode))}</td><td class="n">%${qty(i.taxRate)}</td><td class="n">${money(i.netAmount, r.currency)}</td><td class="n">${money(i.taxAmount, r.currency)}</td><td>${esc(i.condition)}</td></tr>`).join('');
    const body = `<h1>İADE BELGESİ</h1><div class="muted">${esc(RETURN_TYPES[r.type] || r.type)} · ${esc(STATUS[r.status] || r.status)}</div>
      <table class="meta"><tr><td>İade No:</td><td><b>${esc(r.returnNo)}</b></td><td>Orijinal fatura:</td><td>${esc(r.invoiceNo || '-')} (${day(r.invoiceDate)})</td></tr>
      ${r.counterpartyDocNo ? `<tr><td>Karşı taraf iade faturası:</td><td>${esc(r.counterpartyDocNo)} (${day(r.counterpartyDocDate)})</td><td></td><td></td></tr>` : ''}
      ${r.withdrawalDeadline ? `<tr><td>Cayma süresi sonu:</td><td>${day(r.withdrawalDeadline)}</td><td>İade ödeme son günü:</td><td>${r.refundDueDate ? day(r.refundDueDate) : 'Malın taşıyıcıya teslimi / satıcıya ulaşmasıyla başlar'}</td></tr><tr><td>Malın geri gönderim son günü:</td><td>${day(r.goodsReturnDeadline)}</td><td>Taşıyıcıya teslim:</td><td>${day(r.goodsHandedOverDate)}</td></tr>` : ''}
      ${r.refundChannel ? `<tr><td>İade kanalı:</td><td>${esc(r.refundChannel)} ${esc(r.refundRef || '')}</td><td></td><td></td></tr>` : ''}</table>
      <div class="grid">${this.party(r.type === 'PURCHASE_RETURN' ? 'Tedarikçi' : 'Müşteri', r.partySnapshot)}</div>
      <table><thead><tr><th>#</th><th>Mal</th><th class="n">Miktar</th><th class="n">KDV</th><th class="n">Matrah</th><th class="n">KDV tutarı</th><th>Durum</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="totals"><tr><td><b>Toplam</b></td><td class="n"><b>${money(r.grandTotal, r.currency)}</b></td></tr></table>`;
    return this.page(`İade ${r.returnNo}`, body, { notFiscal: true, watermark: r.status === 'DRAFT' ? 'TASLAK' : null });
  }

  async goodsReceipt(id: string): Promise<string> {
    const r = await this.receipts.get(id);
    const wh = await this.dataSource.manager.findOne(WarehouseEntity, { where: { companyId: this.tenant.companyId, id: r.warehouseId } });
    const rows = r.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.productName)}</td><td class="n">${qty(i.orderedQuantity)}</td><td class="n">${qty(i.despatchQuantity)}</td><td class="n">${qty(i.countedQuantity)}</td><td class="n">${qty(i.rejectedQuantity)}${i.rejectReason ? ` (${esc(i.rejectReason)})` : ''}</td><td class="n"><b>${qty(i.acceptedQuantity)}</b></td><td class="n">${i.surplusQuantity ? `+${qty(i.surplusQuantity)} (397)` : i.shortageQuantity ? `-${qty(i.shortageQuantity)} (197)` : '-'}</td></tr>`).join('');
    const body = `<h1>MAL KABUL FİŞİ</h1><div class="muted">${esc(STATUS[r.status] || r.status)}</div>
      <table class="meta"><tr><td>Fiş No:</td><td><b>${esc(r.receiptNo)}</b></td><td>Satın alma siparişi:</td><td>${esc(r.poNumber)}</td></tr>
      <tr><td>Teslim alma:</td><td>${day(new Date(r.receivedAt).toISOString())}</td><td>Depo:</td><td>${esc(wh?.name || '-')}</td></tr>
      <tr><td>Tedarikçi irsaliyesi:</td><td>${esc(r.supplierDespatchNo || '-')} (${day(r.supplierDespatchDate)})</td><td>Tedarikçi faturası:</td><td>${esc(r.supplierInvoiceNo || '-')} (${day(r.supplierInvoiceDate)})</td></tr></table>
      <div class="grid">${this.party('Tedarikçi', r.supplierSnapshot)}</div>
      <table><thead><tr><th>#</th><th>Mal</th><th class="n">Sipariş</th><th class="n">İrsaliye</th><th class="n">Sayılan</th><th class="n">Red</th><th class="n">Kabul</th><th class="n">Fark</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="sign"><div>Teslim eden</div><div>Teslim alan / sayan</div></div>`;
    return this.page(`Mal kabul ${r.receiptNo}`, body, { notFiscal: true, watermark: r.status === 'DRAFT' ? 'TASLAK' : null });
  }

  async expenseVoucher(id: string): Promise<string> {
    const v = await this.vouchers.get(id);
    const company = await this.company();
    const title = v.kind === 'MUSTAHSIL_MAKBUZU' ? 'MÜSTAHSİL MAKBUZU' : 'GİDER PUSULASI';
    const source = v.status === 'DRAFT' ? '' : this.legalSource(v.numberMode, v.documentNo, 'Belge', 'Belgenin');
    const unit = await this.unitNames();
    const rows = (v.lines || []).map((l, n) => `<tr><td>${n + 1}</td><td>${esc(l.description)}</td><td class="n">${qty(l.quantity)} ${esc(unit(l.unitCode))}</td><td class="n">${money(l.unitPrice, v.currency)}</td><td class="n">${money(l.amount, v.currency)}</td></tr>`).join('');
    const body = `<h1>${title} (BİLGİ NÜSHASI)</h1><div class="muted">${esc(STATUS[v.status] || v.status)}</div>${source ? `<div class="muted">${source}</div>` : ''}
      <table class="meta"><tr><td>Seri / sıra:</td><td><b>${esc(v.documentNo || '(düzenlemede verilir)')}</b></td><td>Düzenleme:</td><td>${day(v.issueDate)}</td></tr><tr><td>Teslim:</td><td>${day(v.deliveryDate)}</td><td>Son düzenleme günü:</td><td>${day(v.dueDate)}</td></tr></table>
      <div class="grid">${this.party('Düzenleyen (alıcı)', companySnapshot(company))}${this.party('Satıcı (işi yapan)', v.sellerSnapshot)}</div>
      <table><thead><tr><th>#</th><th>Açıklama</th><th class="n">Miktar</th><th class="n">Birim fiyat</th><th class="n">Tutar</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="totals"><tr><td>Brüt tutar</td><td class="n">${money(v.grossTotal, v.currency)}</td></tr><tr><td>Gelir vergisi stopajı (%${qty(v.withholdingRate)})</td><td class="n">${money(v.withholdingAmount, v.currency)}</td></tr>
      ${v.otherDeductions ? `<tr><td>Diğer kesintiler</td><td class="n">${money(v.otherDeductions, v.currency)}</td></tr>` : ''}<tr><td><b>Ödenen net tutar</b></td><td class="n"><b>${money(v.netPayable, v.currency)}</b></td></tr></table>
      <div class="sign"><div>Düzenleyen (imza)</div><div>Satıcı (imza)</div></div>`;
    return this.page(`${title} ${v.documentNo || 'taslak'}`, body, { notFiscal: true, watermark: v.status === 'DRAFT' ? 'TASLAK' : v.status === 'CANCELLED' ? 'İPTAL' : null });
  }

  /** Sevk / toplama listesi of an order: never a fiscal document. */
  async pickingList(orderId: string): Promise<string> {
    const o = await this.dataSource.manager.findOne(OrderEntity, { where: { companyId: this.tenant.companyId, id: orderId }, relations: { items: true } });
    if (!o) throw new NotFoundException(err('ORDER_NOT_FOUND'));
    const rows = o.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.productName)}</td><td class="n">${qty(i.quantity)}</td><td class="n">${qty(i.despatchedQuantity)}</td><td class="n">${qty(Math.max(0, i.quantity - (i.despatchedQuantity || 0)))}</td><td>${(i.tracking || []).map((t) => esc(t.lotNumber || (t.serials || []).join(', '))).filter(Boolean).join('; ')}</td><td></td></tr>`).join('');
    const body = `<h1>SEVK / TOPLAMA LİSTESİ</h1><table class="meta"><tr><td>Sipariş:</td><td><b>${esc(o.orderNumber)}</b></td><td>Müşteri:</td><td>${esc(o.customerName)}</td></tr><tr><td>Tarih:</td><td>${day(new Date(o.date).toISOString())}</td><td></td><td></td></tr></table>
      <table><thead><tr><th>#</th><th>Ürün</th><th class="n">Sipariş</th><th class="n">Sevk edilen</th><th class="n">Kalan</th><th>Parti / seri</th><th>Toplandı</th></tr></thead><tbody>${rows}</tbody></table>`;
    return this.page(`Toplama listesi ${o.orderNumber}`, body, { notFiscal: true });
  }

  /** Purchase order printed as "Sipariş formu" (not a contract: damga vergisi). */
  async purchaseOrderForm(id: string): Promise<string> {
    const po = await this.dataSource.manager.findOne(PurchaseOrderEntity, { where: { companyId: this.tenant.companyId, id }, relations: { items: true } });
    if (!po) throw new NotFoundException(err('DOCUMENT_NOT_FOUND'));
    const company = await this.company();
    const unit = await this.unitNames();
    const rows = po.items.map((i, n) => `<tr><td>${n + 1}</td><td>${esc(i.productName)}</td><td class="n">${qty(i.unitQuantity || i.quantity)} ${esc(unit(i.unitCode))}</td><td class="n">${money(i.unitPrice, po.currency)}</td><td class="n">%${qty(i.taxRate)}</td><td class="n">${money(i.lineTotal, po.currency)}</td></tr>`).join('');
    const body = `<h1>SİPARİŞ FORMU</h1><table class="meta"><tr><td>Sipariş No:</td><td><b>${esc(po.poNumber)}</b></td><td>Beklenen teslim:</td><td>${day(po.expectedDate)}</td></tr><tr><td>Tedarikçi:</td><td>${esc(po.supplierName)}</td><td></td><td></td></tr></table>
      <div class="grid">${this.party('Sipariş veren', companySnapshot(company))}</div>
      <table><thead><tr><th>#</th><th>Mal</th><th class="n">Miktar</th><th class="n">Birim fiyat</th><th class="n">KDV</th><th class="n">Tutar</th></tr></thead><tbody>${rows}</tbody></table>
      <table class="totals"><tr><td><b>Vergiler dahil toplam</b></td><td class="n"><b>${money(po.grandTotal, po.currency)}</b></td></tr></table>${po.notes ? `<p>${esc(po.notes)}</p>` : ''}`;
    return this.page(`Sipariş formu ${po.poNumber}`, body, { notFiscal: true });
  }
}
