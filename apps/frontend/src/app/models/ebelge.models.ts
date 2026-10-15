/** WP5 e-Belge API shapes. */

export interface ProviderInfo {
  name: string;
  label: string;
  capabilities: Record<string, boolean>;
}

export interface EBelgeSettings {
  id: string;
  provider: string | null;
  environment: 'TEST' | 'LIVE' | string;
  credentials: Record<string, string>;
  hasCredentials: boolean;
  credentialsKeyId: string | null;
  credentialsError: string | null;
  signing: string;
  legalArchive: string;
  sealDeclarationDate: string | null;
  senderAlias: string | null;
  receiverAlias: string | null;
  earsivDefaultChannel: string;
  autoSend: boolean;
  exportEnabled: boolean;
  sectoralItemIdsEnabled: boolean;
  registryCacheHours: number;
  logoDataUri: string | null;
  lastConnectionTestAt: string | null;
  lastConnectionOk: boolean | null;
  outageSince: string | null;
  lastProviderError: string | null;
  inboxLastFetchedAt: string | null;
  providers: ProviderInfo[];
  outboxPending: number;
}

export interface EBelgeStatus {
  mode: string;
  provider: string | null;
  environment: string;
  outage: { since: string; message: string | null } | null;
  outbox: { queued: number; failed: number; dead: number };
  matbudan: { ettn: string; documentNo: string | null; deadlineAt: string; overdue: boolean; status: string }[];
  inbox: { open: number; awaitingResponse: number; dueSoon: number };
  integrityBroken: number;
  today: string;
  legalArchive: string;
}

export interface EDocEvent {
  id: string;
  status: string;
  code: string | null;
  message: string | null;
  source: string;
  at: string;
  actor: string | null;
}

export interface EDocDelivery {
  id: string;
  channel: string;
  recipient: string | null;
  deliveredAt: string;
  note: string | null;
}

export interface EDocNotice {
  id: string;
  kind: string;
  direction: string;
  channel: string;
  noticeDate: string;
  reference: string | null;
  reason: string | null;
  reportedToProvider: boolean;
  providerReference: string | null;
}

export interface EDocOutbox {
  id: string;
  operation: string;
  status: string;
  attempt: number;
  maxAttempts: number;
  nextRetryAt: string;
  lastErrorCode: string | null;
  lastError: string | null;
  deadlineAt: string | null;
  processedAt: string | null;
}

export interface EDocument {
  id: string;
  ettn: string;
  documentType: string;
  direction: 'OUT' | 'IN' | string;
  profileId: string | null;
  typeCode: string | null;
  documentNo: string | null;
  issueDate: string | null;
  sourceType: string;
  sourceId: string | null;
  counterpartyTaxId: string | null;
  counterpartyName: string | null;
  currency: string | null;
  payableAmount: number | null;
  sha256: string;
  storageRef?: string;
  gibStatus: string | null;
  lastStatusAt: string | null;
  retentionUntil: string;
  legalHold: boolean;
  legalHoldReason?: string | null;
  integrityOk: boolean;
  integrityCheckedAt: string | null;
  createdAt: string;
}

export interface EDocumentDetail extends EDocument {
  hasSignedXml: boolean;
  events: EDocEvent[];
  deliveries: EDocDelivery[];
  notices: EDocNotice[];
  outbox: EDocOutbox[];
  cancelWindow: { days: number; deliveredAt: string; lastDay: string; deadline: string; open: boolean; daysLeft: number } | null;
  qr: Record<string, string> | null;
  legalArchive: string;
}

export interface IncomingLine {
  id: string;
  name: string;
  sellersItemId: string | null;
  quantity: number;
  unitCode: string | null;
  unitPrice: number;
  lineExtension: number;
  taxAmount: number;
  taxPercent: number | null;
}

export interface IncomingDocument {
  id: string;
  ettn: string;
  eDocumentId: string | null;
  documentType: 'INVOICE' | 'DESPATCH' | 'RECEIPT_ADVICE' | 'APPLICATION_RESPONSE' | string;
  profileId: string | null;
  typeCode: string | null;
  documentNo: string | null;
  issueDate: string | null;
  senderTaxId: string | null;
  senderName: string | null;
  receivedAt: string;
  actualDespatchAt: string | null;
  currency: string | null;
  payableAmount: number | null;
  taxTotal: number | null;
  lines: IncomingLine[] | null;
  refs: { orderRef?: { id: string; issueDate: string } | null; despatchRefs?: { id: string; issueDate: string }[]; billingRefs?: { id: string; issueDate: string }[]; notes?: string[] } | null;
  status: string;
  matchStatus: string;
  supplierId: string | null;
  customerId: string | null;
  purchaseOrderId: string | null;
  goodsReceiptId: string | null;
  originalInvoiceId: string | null;
  relatedEttn: string | null;
  responseDueAt: string | null;
  responseCode: string | null;
  responseNote: string | null;
  respondedAt: string | null;
  respondedBy: string | null;
  responseEttn: string | null;
  responseLines: { despatchLineId: string; received: number; rejected: number; short: number; rejectReason: string | null }[] | null;
  responseRequired: boolean;
  hoursLeft: number | null;
  expired: boolean;
  supplier?: { id: string; name: string } | null;
  purchaseOrder?: { id: string; poNumber: string; status: string } | null;
  goodsReceipt?: { id: string; receiptNo: string; status: string; supplierInvoiceNo: string | null } | null;
  originalInvoice?: { id: string; documentNo: string | null; issueDate: string | null } | null;
}

export interface RegistryAnswer {
  taxId: string;
  docType: 'INVOICE' | 'DESPATCH';
  registered: boolean;
  aliases: string[];
  checkedAt: string;
  cached: boolean;
}

export function edocBadge(status: string | null | undefined): string {
  switch (status) {
    case 'ACCEPTED':
    case 'DELIVERED':
    case 'GIB_ACCEPTED':
    case 'AUTO_ACCEPTED':
    case 'DONE':
      return 'badge-success';
    case 'QUEUED':
    case 'PENDING':
    case 'PROVIDER_RECEIVED':
    case 'RECEIVED':
    case 'PARTIALLY_ACCEPTED':
    case 'PROCESSING':
    case 'FAILED':
    case 'RETRY_SCHEDULED':
      return 'badge-warning';
    case 'REJECTED':
    case 'CANCELLED':
    case 'DEAD':
    case 'SEND_FAILED':
      return 'badge-danger';
    default:
      return 'badge-neutral';
  }
}
