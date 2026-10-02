import { queryKeys } from '@rbp/api-client';
import type {
  CancelItemRequest,
  CancelOrderRequest,
  CreateOrderRequest,
  CreateReturnRequest,
  OrderApprovalRequest,
  OrderListParams,
  PayOrderRequest,
  UpdateOrderLinesRequest,
} from '@rbp/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { api } from '@/lib/api';

/** Saved sales at the current location (POS-008…012). */
export function useOrders(params: OrderListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.orders.list(scope, params),
    queryFn: ({ signal }) => api.orders.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useOrder(id: string | null | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.orders.detail(scope, id ?? '-'),
    queryFn: ({ signal }) => api.orders.get(id ?? '', signal),
    enabled: ready && !!id,
  });
}

export function useReceipt(orderId: string | null | undefined, returnId?: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.orders.receipt(scope, orderId ?? '-', returnId),
    queryFn: ({ signal }) =>
      returnId
        ? api.orders.returnReceipt(orderId ?? '', returnId, signal)
        : api.orders.receipt(orderId ?? '', signal),
    enabled: ready && !!orderId,
  });
}

/** Every order write can change lists, receipts, customer balances and the audit log. */
function useInvalidateOrders() {
  const queryClient = useQueryClient();
  const { ready: _r, ...scope } = useQueryScope();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all(scope) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all(scope) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(scope) }),
      // Sales, returns and voids move stock (POS stock badges + inventory pages).
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all(scope) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all(scope) }),
    ]);
}

function useOrderMutation<V>(fn: (vars: V) => ReturnType<typeof api.orders.get>) {
  const invalidate = useInvalidateOrders();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useCreateOrder = () =>
  useOrderMutation((body: CreateOrderRequest) => api.orders.create(body));
export const useUpdateOrderLines = () =>
  useOrderMutation(({ id, body }: { id: string; body: UpdateOrderLinesRequest }) =>
    api.orders.updateLines(id, body),
  );
export const useResumeOrder = () => useOrderMutation((id: string) => api.orders.resume(id));
export const usePayOrder = () =>
  useOrderMutation(({ id, body }: { id: string; body: PayOrderRequest }) =>
    api.orders.pay(id, body),
  );
export const useCancelItem = () =>
  useOrderMutation(
    ({ id, lineId, body }: { id: string; lineId: string; body: CancelItemRequest }) =>
      api.orders.cancelItem(id, lineId, body),
  );
export const useCancelOrder = () =>
  useOrderMutation(({ id, body }: { id: string; body: CancelOrderRequest }) =>
    api.orders.cancel(id, body),
  );
export const useVoidOrder = () =>
  useOrderMutation(({ id, body }: { id: string; body: OrderApprovalRequest }) =>
    api.orders.void(id, body),
  );
export const useCreateReturn = () =>
  useOrderMutation(({ id, body }: { id: string; body: CreateReturnRequest }) =>
    api.orders.createReturn(id, body),
  );

export function usePrintReceipt() {
  const invalidate = useInvalidateOrders();
  return useMutation({
    mutationFn: ({ id, returnId }: { id: string; returnId?: string }) =>
      api.orders.print(id, returnId),
    onSuccess: invalidate,
  });
}
