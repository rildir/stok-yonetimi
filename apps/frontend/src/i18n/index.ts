// Bundled dictionaries (SSR-safe, no HTTP); switched at runtime by I18nService.
// One flat JSON per namespace: i18n/<lang>/<namespace>.json
import tr_common from './tr/common.json';
import en_common from './en/common.json';
import tr_layout from './tr/layout.json';
import en_layout from './en/layout.json';
import tr_dashboard from './tr/dashboard.json';
import en_dashboard from './en/dashboard.json';
import tr_products from './tr/products.json';
import en_products from './en/products.json';
import tr_orders from './tr/orders.json';
import en_orders from './en/orders.json';
import tr_suppliers from './tr/suppliers.json';
import en_suppliers from './en/suppliers.json';
import tr_purchaseOrders from './tr/purchaseOrders.json';
import en_purchaseOrders from './en/purchaseOrders.json';
import tr_warehouses from './tr/warehouses.json';
import en_warehouses from './en/warehouses.json';
import tr_stockMovements from './tr/stockMovements.json';
import en_stockMovements from './en/stockMovements.json';
import tr_stockCount from './tr/stockCount.json';
import en_stockCount from './en/stockCount.json';
import tr_reports from './tr/reports.json';
import en_reports from './en/reports.json';
import tr_settings from './tr/settings.json';
import en_settings from './en/settings.json';
import tr_login from './tr/login.json';
import en_login from './en/login.json';
import tr_shared from './tr/shared.json';
import en_shared from './en/shared.json';
import tr_customers from './tr/customers.json';
import en_customers from './en/customers.json';
import tr_finance from './tr/finance.json';
import en_finance from './en/finance.json';
import tr_units from './tr/units.json';
import en_units from './en/units.json';
import tr_auditLog from './tr/auditLog.json';
import en_auditLog from './en/auditLog.json';
import tr_integrations from './tr/integrations.json';
import en_integrations from './en/integrations.json';
import tr_compliance from './tr/compliance.json';
import en_compliance from './en/compliance.json';

export type Dict = Record<string, string>;

export const DICTIONARIES: Record<'tr' | 'en', Dict> = {
  tr: { ...tr_common, ...tr_layout, ...tr_dashboard, ...tr_products, ...tr_orders, ...tr_suppliers, ...tr_purchaseOrders, ...tr_warehouses, ...tr_stockMovements, ...tr_stockCount, ...tr_reports, ...tr_settings, ...tr_login, ...tr_shared, ...tr_customers, ...tr_finance, ...tr_units, ...tr_auditLog, ...tr_integrations, ...tr_compliance, },
  en: { ...en_common, ...en_layout, ...en_dashboard, ...en_products, ...en_orders, ...en_suppliers, ...en_purchaseOrders, ...en_warehouses, ...en_stockMovements, ...en_stockCount, ...en_reports, ...en_settings, ...en_login, ...en_shared, ...en_customers, ...en_finance, ...en_units, ...en_auditLog, ...en_integrations, ...en_compliance, },
};
