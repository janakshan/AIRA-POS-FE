import { queryKeys } from '@rbp/api-client';
import type { DeliveryAssignRequest, DeliveryListParams, DeliveryStatusRequest } from '@rbp/types';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { useInvalidateStock } from '@/features/inventory/api/queries';
import { api } from '@/lib/api';

/** DEL-001…004. Status changes can take payment (stock), so writes refresh stock + orders. */

export function useDeliveries(params: DeliveryListParams) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.deliveries.list(scope, params),
    queryFn: ({ signal }) => api.deliveries.list(params, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
    // The kitchen marks orders ready from another screen.
    refetchInterval: 30_000,
  });
}

export function useDelivery(id: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.deliveries.detail(scope, id ?? '-'),
    queryFn: ({ signal }) => api.deliveries.get(id ?? '', signal),
    enabled: ready && !!id,
    refetchInterval: 30_000,
  });
}

export function useRiders(enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.deliveries.riders(scope),
    queryFn: ({ signal }) => api.deliveries.riders(signal),
    enabled: ready && enabled,
  });
}

function useDeliveryMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const invalidate = useInvalidateStock();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useAdvanceDelivery = () =>
  useDeliveryMutation(({ id, body }: { id: string; body: DeliveryStatusRequest }) =>
    api.orders.deliveryStatus(id, body),
  );

export const useAssignRider = () =>
  useDeliveryMutation(({ id, body }: { id: string; body: DeliveryAssignRequest }) =>
    api.orders.deliveryAssign(id, body),
  );
