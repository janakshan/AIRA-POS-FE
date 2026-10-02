import { useCallback } from 'react';
import { useMe } from '@/features/auth/api/queries';

/** Location names for records from any of the tenant's locations. */
export function useLocationName() {
  const { data: me } = useMe();
  return useCallback(
    (id: string | null | undefined) => (id && me?.locations.find((l) => l.id === id)?.name) || '',
    [me],
  );
}
