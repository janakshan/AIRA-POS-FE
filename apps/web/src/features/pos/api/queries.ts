import { queryKeys } from '@rbp/api-client';
import type {
  CreateAdjustmentRequest,
  DrawerEventRequest,
  VoidAdjustmentRequest,
} from '@rbp/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { api } from '@/lib/api';

const CONFIG_STALE_MS = 10 * 60_000;

/** Tax / service-charge rates for the current location. */
export function usePosSettings() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.pos.settings(scope),
    queryFn: ({ signal }) => api.pos.settings(signal),
    enabled: ready,
    staleTime: CONFIG_STALE_MS,
  });
}

/** POS-005 charge types configured for the current location. */
/** SET-006: payment methods the business accepts (cash is always on). */
export function usePaymentMethods() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.pos.paymentMethods(scope),
    queryFn: ({ signal }) => api.pos.paymentMethods(signal),
    enabled: ready,
    staleTime: CONFIG_STALE_MS,
  });
}

export function useChargeTypes() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.pos.chargeTypes(scope),
    queryFn: ({ signal }) => api.pos.chargeTypes(signal),
    enabled: ready,
    staleTime: CONFIG_STALE_MS,
  });
}

/** POS-004 promotions for the tenant. */
export function usePromotions() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.pos.promotions(scope),
    queryFn: ({ signal }) => api.pos.promotions(signal),
    enabled: ready,
    staleTime: CONFIG_STALE_MS,
  });
}

function useInvalidateAudit() {
  const queryClient = useQueryClient();
  const { tenantId } = useQueryScope();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.audit.all({ tenantId }) });
}

/** Server approval (PIN/permission/reason) + audit for a discount or charge. */
export function useCreateAdjustment() {
  const invalidate = useInvalidateAudit();
  return useMutation({
    mutationFn: (body: CreateAdjustmentRequest) => api.pos.adjustments.create(body),
    onSuccess: invalidate,
  });
}

export function useVoidAdjustment() {
  const invalidate = useInvalidateAudit();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body?: VoidAdjustmentRequest }) =>
      api.pos.adjustments.void(id, body),
    onSuccess: invalidate,
  });
}

/** Open the cash drawer outside a sale (after PIN + reason); audited server-side. */
export function useOpenDrawer() {
  const invalidate = useInvalidateAudit();
  return useMutation({
    mutationFn: (body: DrawerEventRequest) => api.pos.openDrawer(body),
    onSuccess: invalidate,
  });
}
