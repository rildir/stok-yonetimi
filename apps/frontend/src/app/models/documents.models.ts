/** WP4 document regime: despatch advices, invoices, returns, goods receipts, expense vouchers. */
import { TrackingEntry } from './inventory.models';

export interface PartySnapshot {
  name: string;
  legalName?: string | null;
  taxIdType?: string | null;
  taxId?: string | null;
  taxOfficeName?: string | null;
  addressText?: string | null;
  isFinalConsumer?: boolean;
}

export interface DocumentRef {
  id?: string | null;
  documentNo: string | null;
  issueDate: string | null;
  type?: string;
  ettn?: string | null;
}

export interface DriverInfo {
  firstName: string;
  lastName: string;
  tckn: string;
}

export interface PlateInfo {
  plate: string;
  type?: string;
  foreign?: boolean;
}

export interface DespatchLine {
  id: string;
  lineNo: number;
  orderItemId?: string | null;
  productId?: string | null;
  productName: string;
  productSku?: string | null;
  quantity: number;
  unitCode?: string | null;
  warehouseId?: string | null;
  tracking?: TrackingEntry[] | null;
  invoicedQuantity: number;
  returnedQuantity: number;
}

export interface Despatch {
  id: string;
  ettn: string;
  documentNo?: string | null;
  seriesCode?: string | null;
  numberMode?: string | null;
  profileId: string;
  typeCode: string;
  purpose: string;
  status: string;
  orderId?: string | null;
  orderNumber?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  sourceWarehouseId?: string | null;
  targetWarehouseId?: string | null;
  inTransitWarehouseId?: string | null;
  stockEffect: boolean;
  sellerSnapshot?: PartySnapshot | null;
  buyerSnapshot?: PartySnapshot | null;
  deliveryAddress?: Record<string, unknown> | null;
  carrierParty?: { name: string; taxId?: string | null } | null;
  drivers?: DriverInfo[] | null;
  plates?: PlateInfo[] | null;
  actualDespatchAt?: string | null;
  issueDate?: string | null;
  issueTime?: string | null;
  invoiceRefs?: DocumentRef[] | null;
  paperNo?: string | null;
  paperDate?: string | null;
  paperReason?: string | null;
  invoiceStatus: string;
  approvedAt?: string | null;
  approvedBy?: string | null;
  receivedAt?: string | null;
  note?: string | null;
  lines: DespatchLine[];
  createdAt: string;
}

export interface InvoiceLine {
  id: string;
  lineNo: number;
  orderItemId?: string | null;
  despatchLineId?: string | null;
  productId?: string | null;
  productName: string;
  quantity: number;
  unitCode?: string | null;
  baseQuantity: number;
  unitPrice: number;
  discountAmount: number;
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  exemptionCode?: string | null;
  withholdingCode?: string | null;
  withheldTaxAmount: number;
  lineTotal: number;
  returnedQuantity: number;
}

export interface TaxBreakdownRow {
  rate: number;
  exemptionCode?: string | null;
  withholdingRate: number;
  base: number;
  tax: number;
  withheld: number;
}

export interface Invoice {
  id: string;
  ettn: string;
  documentNo?: string | null;
  numberMode?: string | null;
  kind: string;
  profileId: string;
  typeCode: string;
  status: string;
  objection: boolean;
  issueDate?: string | null;
  issueTime?: string | null;
  deliveryDate?: string | null;
  issuedBeforeDelivery: boolean;
  lateIssueConfirmed: boolean;
  customerId?: string | null;
  supplierId?: string | null;
  orderIds?: string[] | null;
  despatchRefs?: DocumentRef[] | null;
  billingReferences?: DocumentRef[] | null;
  sellerSnapshot?: PartySnapshot | null;
  buyerSnapshot?: PartySnapshot | null;
  currency: string;
  exchangeRate: number;
  subtotal: number;
  taxTotal: number;
  withheldTaxTotal: number;
  grandTotal: number;
  payableTotal: number;
  grandTotalTry: number;
  taxBreakdown?: TaxBreakdownRow[] | null;
  internetSaleInfo?: Record<string, string | null> | null;
  replacesDespatch: boolean;
  externalDocNo?: string | null;
  cancelReason?: string | null;
  issuedAt?: string | null;
  issuedBy?: string | null;
  notes?: string | null;
  lines: InvoiceLine[];
  createdAt: string;
}

export interface ReturnItem {
  id: string;
  invoiceLineId?: string | null;
  goodsReceiptItemId?: string | null;
  productName: string;
  quantity: number;
  unitCode?: string | null;
  netAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  condition: string;
  reversesMovementId?: string | null;
}

export interface ReturnDoc {
  id: string;
  returnNo: string;
  type: string;
  status: string;
  invoiceId?: string | null;
  invoiceNo?: string | null;
  invoiceDate?: string | null;
  orderId?: string | null;
  goodsReceiptId?: string | null;
  partySnapshot?: PartySnapshot | null;
  currency: string;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  refundChannel?: string | null;
  refundRef?: string | null;
  counterpartyDocNo?: string | null;
  counterpartyDocDate?: string | null;
  deliveryDate?: string | null;
  notifiedAt?: string | null;
  withdrawalDeadline?: string | null;
  goodsReturnDeadline?: string | null;
  refundDueDate?: string | null;
  goodsHandedOverDate?: string | null;
  returnInvoiceId?: string | null;
  expenseVoucherId?: string | null;
  completedAt?: string | null;
  note?: string | null;
  items: ReturnItem[];
  createdAt: string;
}

export interface GoodsReceiptItem {
  id: string;
  purchaseOrderItemId: string;
  productName: string;
  unitCode?: string | null;
  orderedQuantity: number;
  despatchQuantity: number;
  countedQuantity: number;
  rejectedQuantity: number;
  rejectReason?: string | null;
  acceptedQuantity: number;
  surplusQuantity: number;
  shortageQuantity: number;
  unitPrice: number;
  returnedQuantity: number;
  tracking?: TrackingEntry[] | null;
}

export interface GoodsReceipt {
  id: string;
  receiptNo: string;
  status: string;
  purchaseOrderId: string;
  poNumber?: string | null;
  supplierSnapshot?: PartySnapshot | null;
  warehouseId: string;
  receivedAt: string;
  supplierDespatchNo?: string | null;
  supplierDespatchDate?: string | null;
  supplierInvoiceNo?: string | null;
  supplierInvoiceDate?: string | null;
  supplierInvoiceEttn?: string | null;
  supplierInvoiceAmount?: number | null;
  acceptedNetAmount: number;
  currency: string;
  buyerCarries: boolean;
  ownDespatchId?: string | null;
  requiresExpenseVoucher: boolean;
  expenseVoucherId?: string | null;
  hasDiscrepancy: boolean;
  matchStatus?: string;
  note?: string | null;
  items: GoodsReceiptItem[];
  createdAt: string;
}

export interface ExpenseVoucherLine {
  productId?: string | null;
  description: string;
  quantity: number;
  unitCode?: string | null;
  unitPrice: number;
  amount: number;
}

export interface ExpenseVoucher {
  id: string;
  kind: string;
  documentNo?: string | null;
  numberMode?: string | null;
  status: string;
  issueDate?: string | null;
  deliveryDate?: string | null;
  dueDate?: string | null;
  supplierId?: string | null;
  sellerSnapshot?: PartySnapshot | null;
  goodsReceiptId?: string | null;
  returnId?: string | null;
  currency: string;
  lines: ExpenseVoucherLine[];
  grossTotal: number;
  withholdingRate: number;
  withholdingAmount: number;
  otherDeductions: number;
  netPayable: number;
  paymentChannel?: string | null;
  paymentRef?: string | null;
  signedCopyReceived: boolean;
  cancelReason?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface DocumentSeries {
  id: string;
  kind: string;
  mode: string;
  seriesCode: string;
  isDefault: boolean;
  isActive: boolean;
  note?: string | null;
}

export interface DocumentCounter {
  id: string;
  kind: string;
  mode: string;
  seriesCode: string;
  year: number;
  lastNumber: number;
  lastDate?: string | null;
}

export interface UninvoicedRow {
  source: 'DESPATCH' | 'ORDER';
  id: string;
  documentNo: string | null;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string;
  deliveryDate: string;
  days: number;
  daysLeft: number;
  level: 'ok' | 'warning' | 'critical';
  uninvoicedQuantity: number;
}

export interface DocumentSummary {
  uninvoiced: { total: number; warning: number; critical: number; limitDays: number };
  receiptsWithoutInvoice: number;
  pendingExpenseVouchers: number;
  overdueExpenseVouchers: number;
}

export interface OrderDocuments {
  despatches: Despatch[];
  invoices: Invoice[];
  returns: ReturnDoc[];
}

/** Badge class per document status. */
export function statusBadge(status: string | null | undefined): string {
  switch (status) {
    case 'DRAFT':
      return 'badge-neutral';
    case 'APPROVED':
    case 'ISSUED':
    case 'COMPLETED':
    case 'GIB_ACCEPTED':
    case 'ACCEPTED':
    case 'DELIVERED':
      return 'badge-success';
    case 'HANDED_TO_PROVIDER':
    case 'QUEUED':
    case 'SENT':
    case 'PARTIALLY_ACCEPTED':
      return 'badge-warning';
    case 'CANCELLED':
    case 'REJECTED':
      return 'badge-danger';
    default:
      return 'badge-neutral';
  }
}
