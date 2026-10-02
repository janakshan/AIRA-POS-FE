import { useAccess } from '@/features/auth/hooks/use-access';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { LOCATION_DASHBOARD_ITEM } from '@/navigation/nav-config';

/** DASH-002 is only worth a link when there is more than one location to compare. */
export function useShowLocationDashboard() {
  const { check } = useAccess();
  const { locations } = useMyLocations();
  return locations.length > 1 && check(LOCATION_DASHBOARD_ITEM).allowed;
}
