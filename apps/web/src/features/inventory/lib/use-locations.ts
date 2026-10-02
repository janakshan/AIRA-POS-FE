import { useCallback, useMemo } from 'react';
import { useMe } from '@/features/auth/api/queries';

/** The locations this user can see, and their names. */
export function useMyLocations() {
  const { data: me } = useMe();
  const locations = useMemo(() => me?.locations ?? [], [me]);
  const nameOf = useCallback(
    (id: string | null | undefined) => locations.find((l) => l.id === id)?.name ?? id ?? '',
    [locations],
  );
  return { locations, current: me?.currentLocation ?? null, nameOf };
}
