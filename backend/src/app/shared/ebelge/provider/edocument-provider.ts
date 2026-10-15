/**
 * Integrator (özel entegratör) abstraction (WP5; 509 V.1-V.2, V.9). The application builds and
 * validates UBL-TR; signing (financial seal), transmission to GİB, the e-Arşiv report and the legal
 * archive are the provider's. A real integrator is added by implementing this interface and listing
 * the class in provider/index.ts (EDOCUMENT_PROVIDER_CLASSES); the core does not change.
 */

/** Normalized provider / GİB status of a document. */
export type ProviderStatus =
  /** The integrator accepted the document (signing / transmission pending) */
  | 'PROVIDER_RECEIVED'
  /** GİB accepted it (e-İrsaliye: the goods may travel; e-Fatura: in the receiver's mailbox) */
  | 'GIB_ACCEPTED'
  /** Delivered to the receiver (e-Fatura mailbox / e-Arşiv e-mail) */
  | 'DELIVERED'
  /** TICARIFATURA: receiver answered KABUL */
  | 'ACCEPTED'
  /** Rejected by GİB / the integrator (technical) or RED by the receiver */
  | 'REJECTED'
  | 'CANCELLED';

export type ProviderDocType = 'INVOICE' | 'EARCHIVE' | 'DESPATCH' | 'RECEIPT_ADVICE' | 'APPLICATION_RESPONSE';
export type RegistryDocType = 'INVOICE' | 'DESPATCH';

export interface ProviderCapabilities {
  eFatura: boolean;
  eArsiv: boolean;
  eIrsaliye: boolean;
  receiptAdvice: boolean;
  applicationResponse: boolean;
  cancelEArsiv: boolean;
  reportCancellationOrObjection: boolean;
  inbox: boolean;
  pdf: boolean;
  /** The integrator assigns document numbers itself (getNextNumber) */
  numbering: boolean;
  webhooks: boolean;
}

export interface ProviderContext {
  companyId: string;
  /** Sender VKN / TCKN */
  taxId: string;
  environment: 'TEST' | 'LIVE' | string;
  /** Decrypted credentials / adapter options (never logged) */
  credentials: Record<string, unknown>;
  senderAlias?: string | null;
  receiverAlias?: string | null;
  now?: Date;
}

export interface OutgoingDocument {
  ettn: string;
  docType: ProviderDocType;
  documentNo: string;
  profileId: string;
  typeCode?: string | null;
  xml: string;
  receiverTaxId: string | null;
  receiverAlias?: string | null;
}

export interface EArsivDelivery {
  /** ELEKTRONIK | KAGIT (e-Arşiv report "gönderim şekli") */
  sendType: 'ELEKTRONIK' | 'KAGIT';
  channel: string;
  recipient?: string | null;
  internetSale?: Record<string, unknown> | null;
}

export interface SendResult {
  providerRef: string;
  status: ProviderStatus;
  at: Date;
  message?: string | null;
  /** Number assigned by the integrator (numbering capability) */
  documentNo?: string | null;
}

export interface StatusResult {
  status: ProviderStatus;
  at: Date;
  code?: string | null;
  message?: string | null;
  providerRef?: string | null;
  signedXml?: string | null;
}

export interface RegistryResult {
  registered: boolean;
  aliases: string[];
  title?: string | null;
}

export interface InboxItem {
  ettn: string;
  docType: ProviderDocType;
  xml: string;
  receivedAt: Date;
  senderTaxId?: string | null;
  providerRef?: string | null;
}

export interface NoticeInput {
  ettn: string;
  kind: 'CANCEL' | 'OBJECTION';
  channel: string;
  noticeDate: string;
  reference?: string | null;
  reason?: string | null;
}

export type ProviderErrorCode = 'UNAVAILABLE' | 'TIMEOUT' | 'AUTH' | 'REJECTED' | 'DUPLICATE' | 'NOT_FOUND' | 'NOT_SUPPORTED' | 'CANCEL_WINDOW';

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly retryable = code === 'UNAVAILABLE' || code === 'TIMEOUT' || code === 'AUTH',
    public readonly providerCode?: string | null,
  ) {
    super(message);
  }
}

export interface ProviderWebhookUpdate {
  ettn: string;
  status: ProviderStatus;
  at: Date;
  code?: string | null;
  message?: string | null;
}

export interface EDocumentProvider {
  /** Registry key stored in company_ebelge_settings.provider */
  readonly name: string;
  /** Human-readable name */
  readonly label: string;
  /**
   * A simulator that never reaches GİB (mock): only allowed in the TEST environment on non-production
   * servers, otherwise documents would be numbered and shown as delivered without being sent (VUK 353).
   */
  readonly testOnly?: boolean;
  capabilities(): ProviderCapabilities;
  testConnection(ctx: ProviderContext): Promise<{ ok: boolean; message?: string | null }>;
  /** GİB registered-user query (e-Fatura and e-İrsaliye separately) */
  checkUser(ctx: ProviderContext, taxId: string, docType: RegistryDocType): Promise<RegistryResult>;
  sendInvoice(ctx: ProviderContext, doc: OutgoingDocument): Promise<SendResult>;
  sendEArsiv(ctx: ProviderContext, doc: OutgoingDocument, delivery: EArsivDelivery): Promise<SendResult>;
  sendDespatch(ctx: ProviderContext, doc: OutgoingDocument): Promise<SendResult>;
  sendReceiptAdvice(ctx: ProviderContext, doc: OutgoingDocument): Promise<SendResult>;
  sendApplicationResponse(ctx: ProviderContext, doc: OutgoingDocument): Promise<SendResult>;
  cancelEArsiv(ctx: ProviderContext, ettn: string, reason: string): Promise<{ cancelledAt: Date; providerRef?: string | null }>;
  reportCancellationOrObjection(ctx: ProviderContext, notice: NoticeInput): Promise<{ reference: string }>;
  /** null: the provider does not know the document (never received) */
  getStatus(ctx: ProviderContext, ettn: string, docType: ProviderDocType): Promise<StatusResult | null>;
  fetchInbox(ctx: ProviderContext, since: Date | null): Promise<InboxItem[]>;
  getPdf(ctx: ProviderContext, ettn: string): Promise<Buffer | null>;
  getNextNumber?(ctx: ProviderContext, series: string): Promise<string>;
  /** Verifies and parses a status callback (null: signature invalid) */
  parseWebhook?(ctx: ProviderContext, headers: Record<string, string | undefined>, rawBody: string): ProviderWebhookUpdate[] | null;
}

/**
 * Whether a test-only adapter may be used: never with environment LIVE, and on a production server
 * (NODE_ENV=production) only when EBELGE_ALLOW_MOCK=true is set explicitly (demo installations).
 */
export function providerUsageAllowed(provider: Pick<EDocumentProvider, 'testOnly'>, environment: string, env: Record<string, string | undefined> = process.env): boolean {
  if (!provider.testOnly) return true;
  if (environment !== 'TEST') return false;
  return env['NODE_ENV'] !== 'production' || env['EBELGE_ALLOW_MOCK'] === 'true';
}
