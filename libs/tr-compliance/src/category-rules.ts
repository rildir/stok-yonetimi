/**
 * Regulatory product categories (R67) and their rule table.
 *
 * WP2 holds the data model and validation; WP6 enforces the food rules (lot and
 * expiry mandatory: Tebliğ 2026/11, uyum 31.12.2026). İTS / ÜTS notifications are out
 * of scope: only the data the notifications would need (GTIN, serial / lot) is required.
 */

export const REGULATORY_CATEGORIES = ['none', 'food', 'medicine_its', 'medical_device_uts', 'cosmetic_uts'] as const;
export type RegulatoryCategory = (typeof REGULATORY_CATEGORIES)[number];

/** Company-level modules (every category except 'none'). */
export const COMPLIANCE_MODULES = REGULATORY_CATEGORIES.filter((c) => c !== 'none') as Exclude<RegulatoryCategory, 'none'>[];
export type ComplianceModule = (typeof COMPLIANCE_MODULES)[number];

export interface CategoryRule {
  category: RegulatoryCategory;
  /** Allowed tracking types; null = any */
  tracking: ('none' | 'lot' | 'serial')[] | null;
  /** Expiry (SKT/TETT) must be captured */
  requiresExpiry: boolean;
  requiresGtin: boolean;
  /** 'error' = rejected; 'warning' = reported only */
  severity: 'error' | 'warning';
  legalBasis: string;
}

export const CATEGORY_RULES: Record<RegulatoryCategory, CategoryRule> = {
  none: { category: 'none', tracking: null, requiresExpiry: false, requiresGtin: false, severity: 'error', legalBasis: '-' },
  food: {
    category: 'food',
    tracking: ['lot'],
    requiresExpiry: true,
    requiresGtin: false,
    severity: 'error',
    legalBasis: '5996 s. Kanun; Gıda İzlenebilirlik Tebliği 2026/11 (uyum 31.12.2026); Gıda Etiketleme Yön. (STT / TETT)',
  },
  medicine_its: {
    category: 'medicine_its',
    tracking: ['serial'],
    requiresExpiry: false,
    requiresGtin: true,
    severity: 'error',
    legalBasis: 'İlaç Takip Sistemi (karekod: GTIN + seri no + parti + SKT)',
  },
  medical_device_uts: {
    category: 'medical_device_uts',
    tracking: ['lot', 'serial'],
    requiresExpiry: false,
    requiresGtin: true,
    severity: 'error',
    legalBasis: 'Ürün Takip Sistemi (UDI-DI = GTIN; lot veya seri no)',
  },
  cosmetic_uts: {
    category: 'cosmetic_uts',
    tracking: ['lot'],
    requiresExpiry: false,
    requiresGtin: false,
    severity: 'error',
    legalBasis: 'Kozmetik Yönetmeliği; ÜTS kozmetik kaydı (parti no)',
  },
};

export interface CategoryCheckInput {
  regulatoryCategory?: string | null;
  trackingType?: string | null;
  hasExpiry?: boolean | null;
  gtin14?: string | null;
}

export interface CategoryIssue {
  code: 'REGULATORY_MODULE_DISABLED' | 'REGULATORY_CATEGORY_INVALID' | 'TRACKING_REQUIRED_FOR_CATEGORY' | 'LOT_REQUIRED_FOR_CATEGORY' | 'EXPIRY_REQUIRED_FOR_CATEGORY' | 'GTIN_REQUIRED_FOR_CATEGORY';
  severity: 'error' | 'warning';
  params?: Record<string, string>;
}

/** Validates a product against its regulatory category and the company's enabled modules. */
export function checkCategoryRules(p: CategoryCheckInput, enabledModules: string[] | null | undefined): CategoryIssue[] {
  const category = (p.regulatoryCategory || 'none') as RegulatoryCategory;
  const rule = CATEGORY_RULES[category];
  if (!rule) return [{ code: 'REGULATORY_CATEGORY_INVALID', severity: 'error', params: { category } }];
  if (category === 'none') return [];
  const issues: CategoryIssue[] = [];
  if (!(enabledModules || []).includes(category)) issues.push({ code: 'REGULATORY_MODULE_DISABLED', severity: 'error', params: { category } });
  const tracking = p.trackingType || 'none';
  if (rule.tracking && !rule.tracking.includes(tracking as 'none')) {
    const lotOnly = rule.tracking.length === 1 && rule.tracking[0] === 'lot';
    issues.push({ code: lotOnly ? 'LOT_REQUIRED_FOR_CATEGORY' : 'TRACKING_REQUIRED_FOR_CATEGORY', severity: rule.severity, params: { category, tracking: rule.tracking.join('/') } });
  }
  if (rule.requiresExpiry && !p.hasExpiry) issues.push({ code: 'EXPIRY_REQUIRED_FOR_CATEGORY', severity: rule.severity, params: { category } });
  if (rule.requiresGtin && !p.gtin14) issues.push({ code: 'GTIN_REQUIRED_FOR_CATEGORY', severity: rule.severity, params: { category } });
  return issues;
}
