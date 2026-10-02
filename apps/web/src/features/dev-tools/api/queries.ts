import { queryKeys } from '@rbp/api-client';
import { useQuery } from '@tanstack/react-query';
import { env } from '@/lib/env';
import { devApi } from './dev-api';

/** Demo logins for the login page. Mock mode only — never requested against the real API. */
export function useDemoAccounts() {
  return useQuery({
    queryKey: queryKeys.dev.demoAccounts(),
    queryFn: devApi.demoAccounts,
    enabled: env.isMock,
    staleTime: Infinity,
  });
}

export function useDevTenants(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.dev.tenants(), queryFn: devApi.tenants, enabled });
}

export function useDevMembers(tenantId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.dev.members(tenantId),
    queryFn: () => devApi.members(tenantId ?? ''),
    enabled: enabled && !!tenantId,
  });
}

export function useDevDevices(tenantId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.dev.devices(tenantId),
    queryFn: () => devApi.devices(tenantId ?? ''),
    enabled: enabled && !!tenantId,
  });
}
