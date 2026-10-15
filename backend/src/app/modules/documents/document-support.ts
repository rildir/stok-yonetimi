import { BadRequestException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { err } from '../../shared/i18n/app-error';
import { CompanyEntity } from '../../entities/company.entity';
import { CustomerEntity } from '../../entities/customer.entity';
import { SupplierEntity } from '../../entities/supplier.entity';
import { WarehouseEntity } from '../../entities/warehouse.entity';
import { OrderEntity } from '../../entities/order.entity';
import { PurchaseOrderEntity } from '../../entities/purchase-order.entity';
import { PartySnapshot } from '../../entities/document-common';
import type { InvoiceEntity } from '../../entities/invoice.entity';
import type { DespatchEntity } from '../../entities/despatch.entity';
import { formatAddress } from '../../entities/address.embedded';
import { fiscalStatus } from '../company/fiscal';
import { dateKeyInZone, timeKeyInZone } from '../../shared/tr';

export function companySnapshot(c: CompanyEntity): PartySnapshot {
  return {
    name: c.legalName || c.name,
    legalName: c.legalName ?? null,
    taxIdType: c.taxIdType ?? null,
    taxId: c.taxId ?? null,
    taxOfficeCode: c.taxOfficeCode ?? null,
    taxOfficeName: c.taxOfficeName ?? null,
    mersisNo: c.mersisNo ?? null,
    tradeRegistryNo: c.tradeRegistryNo ?? null,
    kepAddress: c.kepAddress ?? null,
    website: c.website ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    address: addr(c.address, c.country),
    addressText: formatAddress(c.address),
    isFinalConsumer: false,
    isVatTaxpayer: true,
  };
}

function addr(a: any, country?: string | null): PartySnapshot['address'] {
  if (!a) return null;
  return {
    line1: a.line1 ?? null,
    line2: a.line2 ?? null,
    district: a.district ?? null,
    districtId: a.districtId ?? null,
    province: a.province ?? null,
    provinceCode: a.provinceCode ?? null,
    postalCode: a.postalCode ?? null,
    country: a.country || country || 'TR',
  };
}

/** A customer that is not a merchant / VAT taxpayer (VUK 232 limit applies, withdrawal right). */
export function isFinalConsumerCustomer(c: Pick<CustomerEntity, 'type' | 'isVatTaxpayer'> | null | undefined): boolean {
  if (!c) return true;
  return c.type !== 'company' && !c.isVatTaxpayer;
}

export function customerSnapshot(c: CustomerEntity | null, fallbackName?: string): PartySnapshot {
  if (!c) return { name: fallbackName || '-', taxIdType: 'ANONYMOUS', isFinalConsumer: true, isVatTaxpayer: false };
  return {
    name: c.name,
    taxIdType: c.identityType ?? null,
    taxId: c.identityNumber || c.foreignTaxId || null,
    taxOfficeCode: c.taxOfficeCode ?? null,
    taxOfficeName: c.taxOfficeName ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    address: addr(c.address),
    addressText: formatAddress(c.address),
    isFinalConsumer: isFinalConsumerCustomer(c),
    isVatTaxpayer: !!c.isVatTaxpayer,
  };
}

export function supplierSnapshot(s: SupplierEntity | null, fallbackName?: string): PartySnapshot {
  if (!s) return { name: fallbackName || '-' };
  return {
    name: s.name,
    taxIdType: s.identityType ?? null,
    taxId: s.identityNumber ?? null,
    taxOfficeCode: s.taxOfficeCode ?? null,
    taxOfficeName: s.taxOfficeName ?? null,
    email: s.email ?? null,
    phone: s.phone ?? null,
    address: addr(s.address),
    addressText: formatAddress(s.address),
    isFinalConsumer: !s.isTaxpayer,
    isVatTaxpayer: !!s.isVatTaxpayer,
  };
}

export function warehouseAddress(w: WarehouseEntity | null | undefined): PartySnapshot['address'] {
  return w ? addr(w.address) : null;
}

/** 422 COMPANY_FISCAL_INFO_MISSING unless the fields printed on legal documents are present. */
export function assertFiscalComplete(c: CompanyEntity): void {
  const st = fiscalStatus(c);
  if (!st.complete) throw new UnprocessableEntityException(err('COMPANY_FISCAL_INFO_MISSING', { fields: st.missing.join(', ') }));
}

export function nowParts(tz: string, at: Date = new Date()): { date: string; time: string } {
  return { date: dateKeyInZone(at, tz), time: timeKeyInZone(at, tz) };
}

export function requireReason(reason: unknown): string {
  const r = String(reason ?? '').trim();
  if (!r) throw new BadRequestException(err('CANCEL_REASON_REQUIRED'));
  return r.slice(0, 500);
}

/**
 * Callbacks of the order / purchase order modules (they depend on this module, not the other way
 * round): freezing the order's tax data at the first shipment, the purchase order's at the first
 * receipt. Registered by OrderService / PurchaseOrderService on construction.
 */
@Injectable()
export class DocumentHooks {
  orderShipped?: (manager: EntityManager, order: OrderEntity, shippedAt: Date) => Promise<void>;
  purchaseReceived?: (manager: EntityManager, po: PurchaseOrderEntity, receivedAt: Date, documentDate: string | null) => Promise<void>;
  /** e-Belge integration (WP5), registered by EBelgeModule. */
  eDocument?: EDocumentHooks;
}

/** Cancellation input of an issued invoice (e-Fatura: the external notice; e-Arşiv: the 8-day window). */
export interface InvoiceCancelInput {
  reason: string;
  noticeChannel?: string | null;
  noticeDate?: string | null;
  noticeRef?: string | null;
}

/**
 * Callbacks of the e-Belge module, all inside the document transaction: routing (scenario from the GİB
 * registry) before numbering, UBL-TR build + validation + archive + outbox after the document is
 * frozen (a validation error rolls the whole issue back), cancellation rules of e-Arşiv / e-Fatura.
 */
export interface EDocumentHooks {
  beforeInvoiceIssue(manager: EntityManager, invoice: InvoiceEntity, company: CompanyEntity): Promise<void>;
  afterInvoiceIssued(manager: EntityManager, invoice: InvoiceEntity, company: CompanyEntity): Promise<InvoiceEntity | void>;
  beforeInvoiceCancel(manager: EntityManager, invoice: InvoiceEntity, input: InvoiceCancelInput): Promise<void>;
  objectionChanged(manager: EntityManager, invoice: InvoiceEntity, objection: boolean, input: InvoiceCancelInput): Promise<void>;
  beforeDespatchApprove(manager: EntityManager, despatch: DespatchEntity, company: CompanyEntity): Promise<void>;
  afterDespatchApproved(manager: EntityManager, despatch: DespatchEntity, company: CompanyEntity): Promise<void>;
}
