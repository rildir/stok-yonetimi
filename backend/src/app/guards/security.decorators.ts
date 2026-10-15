import { SetMetadata } from '@nestjs/common';

/** Endpoint stays reachable while the user must change a temporary password. */
export const ALLOW_PENDING_PASSWORD_KEY = 'allowPendingPasswordChange';
export const AllowPendingPasswordChange = () => SetMetadata(ALLOW_PENDING_PASSWORD_KEY, true);

/** Platform super administrator only (global legal parameters); API keys are refused. */
export const SUPER_ADMIN_KEY = 'superAdmin';
export const SuperAdmin = () => SetMetadata(SUPER_ADMIN_KEY, true);
