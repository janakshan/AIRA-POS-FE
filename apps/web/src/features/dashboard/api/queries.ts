import { queryKeys } from '@rbp/api-client';
import { useQuery } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { api } from '@/lib/api';

export function useDashboardSummary() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.dashboard.summary(scope),
    queryFn: ({ signal }) => api.dashboard.summary(signal),
    enabled: ready,
  });
}

/** DASH-002: today at every location the user can see; refreshed each minute. */
export function useLocationDashboard() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.dashboard.locations(scope),
    queryFn: ({ signal }) => api.dashboard.locations(signal),
    enabled: ready,
    refetchInterval: 60_000,
  });
}
