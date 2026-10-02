import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useListParams } from '@/lib/use-list-params';

/**
 * Production location filter in the URL (`?location=`). Production runs at bakery-type
 * locations (A-261): defaults to the current location if it is one, else the first.
 */
export function useProductionLocation(filterKeys: string[] = []) {
  const list = useListParams({ filterKeys: ['location', ...filterKeys] });
  const { locations, current, nameOf } = useMyLocations();
  const bakeries = locations.filter((l) => l.type === 'BAKERY');
  const fallback = current?.type === 'BAKERY' ? current.id : (bakeries[0]?.id ?? '');
  const locationId = list.filters.location ?? fallback;
  return {
    list,
    locationId,
    locationName: nameOf(locationId),
    /** No bakery location this user can reach. */
    none: locations.length > 0 && bakeries.length === 0,
    setLocation: (id: string) => list.setFilter('location', id === fallback ? null : id),
  };
}
