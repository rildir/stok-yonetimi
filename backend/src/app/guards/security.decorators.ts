import { SetMetadata } from '@nestjs/common';

/** Endpoint stays reachable while the user must change a temporary password. */
export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPasswordChange';
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

/** Platform super administrator only (global legal parameters); API keys are refused. */
export const SUPER_ADMIN_KEY = 'superAdmin';
export const SuperAdmin = () => SetMetadata(SUPER_ADMIN_KEY, true);

/**
 * WP7: the caller's own account (profile, password, 2FA, sessions, notice acceptance): writes are
 * allowed for the read-only auditor role and in a closed (retention-frozen) tenant.
 */
export const SELF_SERVICE_KEY = 'selfService';
export const SelfService = () => SetMetadata(SELF_SERVICE_KEY, true);

/** WP7: reachable while an administrator still has to set up the mandatory 2FA (TOTP_REQUIRED). */
export const ALLOW_TOTP_SETUP_KEY = 'allowTotpSetup';
export const AllowTotpSetup = () => SetMetadata(ALLOW_TOTP_SETUP_KEY, true);

/** WP7: fine-grained permission on top of the roles (see shared/kvkk/permissions.ts). */
export const REQUIRE_PERMISSION_KEY = 'requirePermission';
export const RequirePermission = (permission: string) => SetMetadata(REQUIRE_PERMISSION_KEY, permission);
