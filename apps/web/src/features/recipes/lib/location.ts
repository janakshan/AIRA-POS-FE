import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useListParams } from '@/lib/use-list-params';

/** Location filter in the URL (`?location=`), defaulting to the current location. */
export function useRecipeLocation(filterKeys: string[] = []) {
  const list = useListParams({ filterKeys: ['location', ...filterKeys] });
  const { current, nameOf } = useMyLocations();
  const locationId = list.filters.location ?? current?.id ?? '';
  return {
    list,
    locationId,
    locationName: nameOf(locationId),
    setLocation: (id: string) => list.setFilter('location', id === current?.id ? null : id),
  };
}
