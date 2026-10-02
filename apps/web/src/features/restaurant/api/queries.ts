import { queryKeys } from '@rbp/api-client';
import type { DeliveryStatus, KotListParams, TransferTableRequest } from '@rbp/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { api } from '@/lib/api';

/** Tables change as other waiters work, so they refresh on their own. */
const TABLES_REFRESH_MS = 10_000;
/** KOT-003 board polling (a real deployment would push over a socket). */
export const KOTS_REFRESH_MS = 5_000;

/** REST-001 tables at the current location with live state. */
export function useTables(enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.tables(scope),
    queryFn: ({ signal }) => api.tables.list(signal),
    enabled: ready && enabled,
    refetchInterval: TABLES_REFRESH_MS,
  });
}

/** KOT-001/003 kitchen tickets at the current location, oldest first. */
export function useKots(params: KotListParams = {}, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.kots.list(scope, params),
    queryFn: ({ signal }) => api.kots.list(params, signal),
    enabled: ready && enabled,
    refetchInterval: KOTS_REFRESH_MS,
  });
}

/** Restaurant writes touch orders, tables, tickets and the audit log together. */
function useInvalidateRestaurant() {
  const queryClient = useQueryClient();
  const { ready: _r, ...scope } = useQueryScope();
  return () =>
    Promise.all(
      [
        queryKeys.orders.all(scope),
        queryKeys.tables(scope),
        queryKeys.kots.all(scope),
        queryKeys.audit.all(scope),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

function useRestaurantMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const invalidate = useInvalidateRestaurant();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useSendToKitchen = () =>
  useRestaurantMutation((orderId: string) => api.orders.sendToKitchen(orderId));
export const usePrintBill = () =>
  useRestaurantMutation((orderId: string) => api.orders.bill(orderId));
export const useReleaseOrder = () =>
  useRestaurantMutation((orderId: string) => api.orders.release(orderId));
export const useDeliveryStatus = () =>
  useRestaurantMutation(({ id, status }: { id: string; status: DeliveryStatus }) =>
    api.orders.deliveryStatus(id, { status }),
  );
export const useTransferTable = () =>
  useRestaurantMutation(({ tableId, body }: { tableId: string; body: TransferTableRequest }) =>
    api.tables.transfer(tableId, body),
  );
export const useKotAction = () =>
  useRestaurantMutation(({ id, action }: { id: string; action: 'start' | 'ready' | 'complete' }) =>
    api.kots[action](id),
  );
