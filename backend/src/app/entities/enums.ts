export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  VIEWER = 'viewer',
  /** Read-only auditor (denetçi): every read, no write; personal identifiers masked */
  AUDITOR = 'auditor',
}

export enum ProductStatus {
  IN_STOCK = 'In stock',
  LOW_STOCK = 'Low stock',
  OUT_OF_STOCK = 'Out of stock',
}

export enum OrderStatus {
  COMPLETED = 'Completed',
  PENDING = 'Pending',
  CANCELLED = 'Cancelled',
}

export enum PurchaseOrderStatus {
  DRAFT = 'Draft',
  SENT = 'Sent',
  PARTIALLY_RECEIVED = 'Partially Received',
  RECEIVED = 'Received',
  CANCELLED = 'Cancelled',
}

export enum StockMovementType {
  IN = 'IN',
  OUT = 'OUT',
  ORDER = 'ORDER',
  RETURN = 'RETURN',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER_OUT = 'TRANSFER_OUT',
  TRANSFER_IN = 'TRANSFER_IN',
  /** Correction: exact opposite of an earlier movement (reversesMovementId) */
  REVERSAL = 'REVERSAL',
  /** Goods taken out of use for good (zayi, imha, hurda, SKT geçmiş) */
  DISPOSAL = 'DISPOSAL',
  /** Transfer legs at a QUARANTINE warehouse */
  QUARANTINE_IN = 'QUARANTINE_IN',
  QUARANTINE_OUT = 'QUARANTINE_OUT',
}
