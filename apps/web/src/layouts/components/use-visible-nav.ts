import { useMemo } from 'react';
import { useMe } from '@/features/auth/api/queries';
import { useAccess } from '@/features/auth/hooks/use-access';
import { isRestaurantPos } from '@/features/pos/lib/pos-mode';
import { NAV_GROUPS } from '@/navigation/nav-config';

/**
 * Navigation filtered by tenant features AND user permissions. Retail and Restaurant POS are one
 * screen whose mode follows the location, so only the entry for the current mode is shown.
 */
export function useVisibleNav() {
  const { check } = useAccess();
  const { data: me } = useMe();
  const hiddenPos = isRestaurantPos(me) ? 'retailPos' : 'restaurantPos';
  return useMemo(
    () =>
      NAV_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((i) => i.key !== hiddenPos && check(i).allowed),
      })).filter((g) => g.items.length > 0),
    [check, hiddenPos],
  );
}
