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
