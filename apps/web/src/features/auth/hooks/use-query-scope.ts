import type { QueryScope } from '@rbp/api-client';
import { useSessionStore } from '@/stores/session-store';
import { useMe } from '../api/queries';

/**
 * Tenant + location for query keys, taken from the server-confirmed /me (never from local state),
 * so cached data can't leak across tenants or locations. `ready` is false until both are known,
 * and always false once signed out.
 */
export function useQueryScope(): QueryScope & { ready: boolean } {
  const signedIn = useSessionStore((s) => !!s.accessToken);
  const { data: me } = useMe();
  const tenantId = me?.tenant.id;
  const locationId = me?.currentLocation?.id;
  return { tenantId, locationId, ready: signedIn && !!tenantId && !!locationId };
}
