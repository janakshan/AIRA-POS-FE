import type { FeatureCode, MeResponse, Permission } from '@rbp/types';
import type { AccessRequirement } from '@/navigation/nav-config';

export type AccessResult =
  | { allowed: true }
  | { allowed: false; reason: 'feature'; feature: FeatureCode }
  | { allowed: false; reason: 'permission'; permission: Permission };

/** Pure access check: tenant entitlement first, then user permission. */
export function checkAccess(
  me: Pick<MeResponse, 'features' | 'permissions'> | undefined,
  req: AccessRequirement,
): AccessResult {
  if (req.feature && !me?.features.includes(req.feature)) {
    return { allowed: false, reason: 'feature', feature: req.feature };
  }
  if (
    req.permission &&
    !me?.permissions.includes(req.permission) &&
    !req.orPermissions?.some((p) => me?.permissions.includes(p))
  ) {
    return { allowed: false, reason: 'permission', permission: req.permission };
  }
  return { allowed: true };
}
