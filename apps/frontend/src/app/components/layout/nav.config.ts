/** Sidebar + command palette navigation (one source). Labels are i18n keys. */
export interface NavItem {
  route: string;
  labelKey: string;
  icon: string;
  /** Roles that see the item; omitted = everyone. */
  roles?: string[];
  keywords?: string[];
}

export interface NavSection {
  labelKey: string | null;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    labelKey: null,
    items: [{ route: '/dashboard', labelKey: 'layout.nav.dashboard', icon: 'home', keywords: ['panel', 'özet', 'dashboard', 'overview'] }],
  },
  {
    labelKey: 'layout.group.stock',
    items: [
      { route: '/products', labelKey: 'layout.nav.products', icon: 'box', keywords: ['ürün', 'ürünler', 'products', 'product', 'stok', 'malzeme', 'sku'] },
      { route: '/stock-movements', labelKey: 'layout.nav.stockMovements', icon: 'swap', keywords: ['stok', 'hareket', 'giriş', 'çıkış', 'transfer', 'movements', 'movement'] },
      { route: '/stock-count', labelKey: 'layout.nav.stockCount', icon: 'count', keywords: ['sayım', 'count', 'inventory', 'envanter'] },
      { route: '/warehouses', labelKey: 'layout.nav.warehouses', icon: 'warehouse', keywords: ['depo', 'depolar', 'warehouse', 'warehouses', 'şube'] },
    ],
  },
  {
    labelKey: 'layout.group.operations',
    items: [
      { route: '/orders', labelKey: 'layout.nav.orders', icon: 'bag', keywords: ['sipariş', 'siparişler', 'orders', 'order', 'satış', 'sales'] },
      { route: '/customers', labelKey: 'layout.nav.customers', icon: 'users', keywords: ['müşteri', 'cari', 'customer', 'customers', 'alıcı'] },
      { route: '/purchase-orders', labelKey: 'layout.nav.purchaseOrders', icon: 'cart', keywords: ['satın alma', 'purchase', 'po', 'tedarik', 'procurement'] },
      { route: '/suppliers', labelKey: 'layout.nav.suppliers', icon: 'truck', keywords: ['tedarikçi', 'supplier', 'suppliers', 'vendor', 'satıcı'] },
    ],
  },
  {
    labelKey: 'layout.group.documents',
    items: [
      { route: '/invoices', labelKey: 'layout.nav.invoices', icon: 'receipt', keywords: ['fatura', 'e-fatura', 'e-arşiv', 'invoice', 'invoices'] },
      { route: '/despatches', labelKey: 'layout.nav.despatches', icon: 'truck', keywords: ['irsaliye', 'e-irsaliye', 'sevk', 'despatch', 'delivery'] },
      { route: '/goods-receipts', labelKey: 'layout.nav.goodsReceipts', icon: 'box-in', keywords: ['mal kabul', 'goods receipt', 'teslim alma'] },
      { route: '/returns', labelKey: 'layout.nav.returns', icon: 'return', keywords: ['iade', 'return', 'returns'] },
      { route: '/expense-vouchers', labelKey: 'layout.nav.expenseVouchers', icon: 'expense', keywords: ['gider pusulası', 'expense', 'voucher'] },
      { route: '/disposals', labelKey: 'layout.nav.disposals', icon: 'trash', roles: ['admin', 'manager'], keywords: ['imha', 'fire', 'disposal'] },
      { route: '/inbox', labelKey: 'layout.nav.inbox', icon: 'inbox', keywords: ['gelen', 'inbox', 'e-belge'] },
    ],
  },
  {
    labelKey: 'layout.group.system',
    items: [
      { route: '/reports', labelKey: 'layout.nav.reports', icon: 'bars', keywords: ['rapor', 'raporlar', 'analiz', 'reports', 'analytics', 'kdv', 'envanter'] },
      { route: '/settings', labelKey: 'layout.nav.settings', icon: 'settings', keywords: ['ayarlar', 'settings', 'profil', 'güvenlik', 'şifre', 'kvkk', 'profile'] },
      { route: '/audit-log', labelKey: 'layout.nav.auditLog', icon: 'audit', roles: ['admin', 'auditor'], keywords: ['denetim', 'kayıt', 'audit', 'log'] },
      { route: '/integrations', labelKey: 'layout.nav.integrations', icon: 'code', roles: ['admin'], keywords: ['entegrasyon', 'api', 'webhook', 'integrations'] },
    ],
  },
];

/** Create actions: palette + "N then <key>" chords (pages read ?open=new). */
export interface CreateAction {
  key: string;
  labelKey: string;
  route: string;
  icon: string;
  keywords: string[];
}

export const CREATE_ACTIONS: CreateAction[] = [
  { key: 'P', labelKey: 'layout.action.newProduct', route: '/products', icon: 'box', keywords: ['yeni', 'ürün', 'ekle', 'new', 'product'] },
  { key: 'M', labelKey: 'layout.action.newMovement', route: '/stock-movements', icon: 'swap', keywords: ['yeni', 'hareket', 'giriş', 'çıkış', 'new', 'movement'] },
  { key: 'O', labelKey: 'layout.action.newOrder', route: '/orders', icon: 'bag', keywords: ['yeni', 'sipariş', 'satış', 'new', 'order'] },
  { key: 'C', labelKey: 'layout.action.newCustomer', route: '/customers', icon: 'users', keywords: ['yeni', 'müşteri', 'cari', 'new', 'customer'] },
  { key: 'B', labelKey: 'layout.action.newPurchaseOrder', route: '/purchase-orders', icon: 'cart', keywords: ['yeni', 'satın alma', 'new', 'purchase', 'po'] },
  { key: 'S', labelKey: 'layout.action.newSupplier', route: '/suppliers', icon: 'truck', keywords: ['yeni', 'tedarikçi', 'new', 'supplier'] },
  { key: 'W', labelKey: 'layout.action.newWarehouse', route: '/warehouses', icon: 'warehouse', keywords: ['yeni', 'depo', 'new', 'warehouse'] },
];

export function visibleSections(role: string | undefined): NavSection[] {
  return NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => !i.roles || (role != null && i.roles.includes(role))) })).filter((s) => s.items.length);
}
