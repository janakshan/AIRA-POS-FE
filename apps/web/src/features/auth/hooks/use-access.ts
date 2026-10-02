import type { FeatureCode, Permission } from '@rbp/types';
import { useCallback } from 'react';
import type { AccessRequirement } from '@/navigation/nav-config';
import { useMe } from '../api/queries';
import { checkAccess } from '../access';

export function useAccess() {
  const { data: me } = useMe();
  const check = useCallback((req: AccessRequirement) => checkAccess(me, req), [me]);
  const can = useCallback(
    (permission: Permission) => checkAccess(me, { permission }).allowed,
    [me],
  );
  const hasFeature = useCallback(
    (feature: FeatureCode) => checkAccess(me, { feature }).allowed,
    [me],
  );
  return { check, can, hasFeature };
}
