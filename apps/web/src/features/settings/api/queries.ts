import { queryKeys } from '@rbp/api-client';
import type {
  BusinessRequest,
  DeviceRequest,
  LanguageRequest,
  PaymentSettingsRequest,
  StationRequest,
  ChargeSettingsRequest,
  LocationRequest,
  RoleRequest,
  SettingsUserListParams,
  UserCreateRequest,
  UserRequest,
} from '@rbp/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { api } from '@/lib/api';

/** SET-002/003/004/007. Settings change what the rest of the app sees, so writes refresh it too. */

function useInvalidateSettings() {
  const queryClient = useQueryClient();
  const { tenantId } = useQueryScope();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all({ tenantId }) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all({ tenantId }) }),
      // POS settings and charge types are keyed per location: refresh every location's.
      queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[1] === tenantId && q.queryKey[3] === 'pos',
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.locations({ tenantId }) }),
      // Devices and kitchen stations feed pickers elsewhere (Quick Pad, Location products).
      queryClient.invalidateQueries({
        queryKey: queryKeys.devices({ tenantId }, undefined).slice(0, -1),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all({ tenantId }) }),
      // Roles, locations and sign-ins feed /me (permissions, location list).
      queryClient.invalidateQueries({ queryKey: ['me'] }),
    ]);
}

export function useChargeSettings(locationId: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.settings.charges(scope, locationId),
    queryFn: ({ signal }) => api.settings.charges.get(locationId, signal),
    enabled: ready && !!locationId,
    placeholderData: keepPreviousData,
  });
}

export function useSaveCharges() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: ({ locationId, body }: { locationId: string; body: ChargeSettingsRequest }) =>
      api.settings.charges.save(locationId, body),
    onSuccess: invalidate,
  });
}

export function useSettingsLocations() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.settings.locations(scope),
    queryFn: ({ signal }) => api.settings.locations.list(signal),
    enabled: ready,
  });
}

export function useSaveLocation() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: LocationRequest }) =>
      id ? api.settings.locations.update(id, body) : api.settings.locations.create(body),
    onSuccess: invalidate,
  });
}

export function useSettingsUsers(params: SettingsUserListParams = {}) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.settings.users(scope, params),
    queryFn: ({ signal }) => api.settings.users.list(params, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}

export function useSaveUser() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (
      v: { id: string; body: UserRequest } | { id?: undefined; body: UserCreateRequest },
    ) =>
      v.id === undefined
        ? api.settings.users.create(v.body)
        : api.settings.users.update(v.id, v.body),
    onSuccess: invalidate,
  });
}

export function useResetPassword() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.settings.users.resetPassword(id, { password }),
    onSuccess: invalidate,
  });
}

export function useSettingsRoles() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.settings.roles(scope),
    queryFn: ({ signal }) => api.settings.roles.list(signal),
    enabled: ready,
  });
}

export function useSaveRole() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: RoleRequest }) =>
      id ? api.settings.roles.update(id, body) : api.settings.roles.create(body),
    onSuccess: invalidate,
  });
}

export function useDeleteRole() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (id: string) => api.settings.roles.remove(id),
    onSuccess: invalidate,
  });
}

export function useBusinessSettings() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.settings.business(scope),
    queryFn: ({ signal }) => api.settings.business.get(signal),
    enabled: ready,
  });
}

export function useSaveBusiness() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (body: BusinessRequest) => api.settings.business.save(body),
    onSuccess: invalidate,
  });
}

export function useSettingsDevices() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.settings.devices(scope),
    queryFn: ({ signal }) => api.settings.devices.list(signal),
    enabled: ready,
  });
}

export function useSaveDevice() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: DeviceRequest }) =>
      id ? api.settings.devices.update(id, body) : api.settings.devices.create(body),
    onSuccess: invalidate,
  });
}

export function useNewDeviceCode() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (id: string) => api.settings.devices.newCode(id),
    onSuccess: invalidate,
  });
}

export function usePaymentSettings() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.settings.payments(scope),
    queryFn: ({ signal }) => api.settings.payments.get(signal),
    enabled: ready,
  });
}

export function useSavePayments() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (body: PaymentSettingsRequest) => api.settings.payments.save(body),
    onSuccess: invalidate,
  });
}

export function usePrinterSettings(locationId: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.settings.printers(scope, locationId),
    queryFn: ({ signal }) => api.settings.printers.get(locationId, signal),
    enabled: ready && !!locationId,
    placeholderData: keepPreviousData,
  });
}

export function useSaveReceiptPrinter() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: ({ locationId, receiptPrinter }: { locationId: string; receiptPrinter: string }) =>
      api.settings.printers.save(locationId, { receiptPrinter }),
    onSuccess: invalidate,
  });
}

export function useSaveStation() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: StationRequest }) =>
      id ? api.settings.stations.update(id, body) : api.settings.stations.create(body),
    onSuccess: invalidate,
  });
}

export function useDeleteStation() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (id: string) => api.settings.stations.remove(id),
    onSuccess: invalidate,
  });
}

export function useLanguageSettings() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.settings.languages(scope),
    queryFn: ({ signal }) => api.settings.languages.get(signal),
    enabled: ready,
  });
}

export function useSaveLanguages() {
  const invalidate = useInvalidateSettings();
  return useMutation({
    mutationFn: (body: LanguageRequest) => api.settings.languages.save(body),
    onSuccess: invalidate,
  });
}

export function useFeatureSettings() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.settings.features(scope),
    queryFn: ({ signal }) => api.settings.features.get(signal),
    enabled: ready,
  });
}
