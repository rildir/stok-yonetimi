export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  VIEWER = 'viewer',
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
}

export enum SubscriptionPlan {
  STANDARD = 'standard',
  PROFESSIONAL = 'professional',
  ULTRA = 'ultra',
  NONE = 'none',
}
