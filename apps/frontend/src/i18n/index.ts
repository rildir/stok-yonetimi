// Dictionaries (SSR-safe, no HTTP); switched at runtime by I18nService.
// One flat JSON per namespace: i18n/<lang>/<namespace>.json
// Turkish (default and fallback language) is bundled; English is a lazy chunk loaded by
// I18nService before the app starts (APP_INITIALIZER) or when the user switches language.
import tr_common from './tr/common.json';
import tr_layout from './tr/layout.json';
import tr_dashboard from './tr/dashboard.json';
import tr_products from './tr/products.json';
import tr_orders from './tr/orders.json';
import tr_suppliers from './tr/suppliers.json';
import tr_purchaseOrders from './tr/purchaseOrders.json';
import tr_warehouses from './tr/warehouses.json';
import tr_stockMovements from './tr/stockMovements.json';
import tr_stockCount from './tr/stockCount.json';
import tr_reports from './tr/reports.json';
import tr_settings from './tr/settings.json';
import tr_login from './tr/login.json';
import tr_shared from './tr/shared.json';
import tr_customers from './tr/customers.json';
import tr_finance from './tr/finance.json';
import tr_units from './tr/units.json';
import tr_auditLog from './tr/auditLog.json';
import tr_integrations from './tr/integrations.json';
import tr_compliance from './tr/compliance.json';
import tr_documents from './tr/documents.json';

export type Dict = Record<string, string>;
export type DictLang = 'tr' | 'en';

export const TR_DICTIONARY: Dict = { ...tr_common, ...tr_layout, ...tr_dashboard, ...tr_products, ...tr_orders, ...tr_suppliers, ...tr_purchaseOrders, ...tr_warehouses, ...tr_stockMovements, ...tr_stockCount, ...tr_reports, ...tr_settings, ...tr_login, ...tr_shared, ...tr_customers, ...tr_finance, ...tr_units, ...tr_auditLog, ...tr_integrations, ...tr_compliance, ...tr_documents, };

/** Dictionary of a language: Turkish synchronously, English from its lazy chunk. */
export function loadDictionary(lang: DictLang): Promise<Dict> {
  if (lang === 'en') return import('./en').then((m) => m.EN_DICTIONARY);
  return Promise.resolve(TR_DICTIONARY);
}
