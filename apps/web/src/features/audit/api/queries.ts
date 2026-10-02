import { queryKeys } from '@rbp/api-client';
import type { AuditListParams } from '@rbp/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { api } from '@/lib/api';

/** Tenant-configured reasons (POS-007), optionally only those for one sensitive action. */
export function useReasons(action?: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.reasons(scope, action),
    queryFn: ({ signal }) => api.reasons.list(action, signal),
    enabled: ready,
    staleTime: 30 * 60_000,
  });
}

/** Employees at the user's locations (audit filters). */
export function useEmployees() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.employees(scope),
    queryFn: ({ signal }) => api.employees.list(undefined, signal),
    enabled: ready,
    staleTime: 10 * 60_000,
  });
}

export function useAuditEvents(params: AuditListParams = {}, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.audit.list(scope, params),
    queryFn: ({ signal }) => api.audit.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}
