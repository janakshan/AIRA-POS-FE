import { queryKeys } from '@rbp/api-client';
import type { EmployeeVerificationRequest, LoginRequest } from '@rbp/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

export function useMe() {
  const token = useSessionStore((s) => s.accessToken);
  const locationId = useSessionStore((s) => s.locationId);
  return useQuery({
    queryKey: queryKeys.me(token, locationId),
    queryFn: ({ signal }) => api.identity.me(signal),
    enabled: !!token,
    staleTime: 5 * 60_000,
    // Keep the shell on screen while switching location — but not after sign-out, or the stale
    // /me keeps scoped queries (e.g. the root reason prompt) "ready" and firing without a token.
    placeholderData: token ? keepPreviousData : undefined,
  });
}

export function useLogin() {
  const signIn = useSessionStore((s) => s.signIn);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => api.auth.login(body),
    onSuccess: ({ accessToken }) => {
      queryClient.clear();
      signIn(accessToken);
    },
  });
}

export function useLogout() {
  const signOut = useSessionStore((s) => s.signOut);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.auth.logout().catch(() => undefined),
    onSettled: () => {
      signOut();
      queryClient.clear();
    },
  });
}

/** Switch operating location; all location-scoped queries re-key automatically. */
export function useSwitchLocation() {
  const setLocation = useSessionStore((s) => s.setLocation);
  const setDevice = useSessionStore((s) => s.setDevice);
  return (locationId: string) => {
    setDevice(null);
    setLocation(locationId);
  };
}

export function useVerifyEmployee() {
  return useMutation({
    mutationFn: (body: EmployeeVerificationRequest) => api.identity.verifyEmployee(body),
  });
}
