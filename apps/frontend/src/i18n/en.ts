// English dictionary (lazy chunk, see index.ts).
import en_common from './en/common.json';
import en_layout from './en/layout.json';
import en_dashboard from './en/dashboard.json';
import en_products from './en/products.json';
import en_orders from './en/orders.json';
import en_suppliers from './en/suppliers.json';
import en_purchaseOrders from './en/purchaseOrders.json';
import en_warehouses from './en/warehouses.json';
import en_stockMovements from './en/stockMovements.json';
import en_stockCount from './en/stockCount.json';
import en_reports from './en/reports.json';
import en_settings from './en/settings.json';
import en_login from './en/login.json';
import en_shared from './en/shared.json';
import en_customers from './en/customers.json';
import en_finance from './en/finance.json';
import en_units from './en/units.json';
import en_auditLog from './en/auditLog.json';
import en_integrations from './en/integrations.json';
import en_compliance from './en/compliance.json';
import en_documents from './en/documents.json';
import type { Dict } from './index';

export const EN_DICTIONARY: Dict = { ...en_common, ...en_layout, ...en_dashboard, ...en_products, ...en_orders, ...en_suppliers, ...en_purchaseOrders, ...en_warehouses, ...en_stockMovements, ...en_stockCount, ...en_reports, ...en_settings, ...en_login, ...en_shared, ...en_customers, ...en_finance, ...en_units, ...en_auditLog, ...en_integrations, ...en_compliance, ...en_documents, };
