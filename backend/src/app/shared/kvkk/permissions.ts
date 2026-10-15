/**
 * Fine-grained permissions on top of the roles (WP7, R61, R65).
 *  - customers.pii.read   : see personal identifiers (TCKN / YKN / passport) in clear, "Göster" (reveal)
 *  - customers.pii.export : personal-data columns in CSV exports
 *  - kvkk.manage          : KVKK tools (notices, data-subject requests, destruction, incidents, tenant closure)
 *
 * Roles grant defaults; an administrator can grant extra permissions per user (users.permissions).
 * API keys get customers.pii.* through the `customers_pii` scope.
 */
export const PERMISSIONS = ['customers.pii.read', 'customers.pii.export', 'kvkk.manage'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['admin', 'manager', 'viewer', 'auditor'] as const;

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: ['customers.pii.read', 'customers.pii.export', 'kvkk.manage'],
  manager: ['customers.pii.read'],
  // Denetçi (TTK 64/1, VUK 256 incelemesi): read-only, sees masked personal identifiers.
  auditor: [],
  viewer: [],
};

export function effectivePermissions(role: string | null | undefined, extra?: string[] | null): Permission[] {
  const set = new Set<Permission>(ROLE_PERMISSIONS[role || ''] || []);
  for (const p of extra || []) if ((PERMISSIONS as readonly string[]).includes(p)) set.add(p as Permission);
  return [...set];
}

/** Permissions of an API key from its scopes (customers_pii: read -> pii.read, write -> pii.read + export). */
export function apiKeyPermissions(scopes: Record<string, string> | null | undefined): Permission[] {
  const s = scopes?.['customers_pii'];
  if (s === 'write') return ['customers.pii.read', 'customers.pii.export'];
  if (s === 'read') return ['customers.pii.read'];
  return [];
}

export function hasPermission(user: { permissions?: string[] } | null | undefined, p: Permission): boolean {
  return !!user?.permissions?.includes(p);
}
