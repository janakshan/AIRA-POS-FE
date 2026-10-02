import { queryKeys } from '@rbp/api-client';
import type {
  CreateStockAdjustmentRequest,
  CreateStockTransferRequest,
  InventoryListParams,
  ReceiveStockTransferRequest,
  StockAdjustmentListParams,
  StockMovementListParams,
  StockTransferListParams,
} from '@rbp/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { api } from '@/lib/api';

export function useInventory(params: InventoryListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.inventory.list(scope, params),
    queryFn: ({ signal }) => api.inventory.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useInventoryItem(productId: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.inventory.detail(scope, productId ?? '-'),
    queryFn: ({ signal }) => api.inventory.get(productId ?? '', signal),
    enabled: ready && !!productId,
  });
}

export function useLowStock() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.inventory.lowStock(scope),
    queryFn: ({ signal }) => api.inventory.lowStock(signal),
    enabled: ready,
  });
}

export function useStockMovements(params: StockMovementListParams) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.inventory.movements(scope, params),
    queryFn: ({ signal }) => api.stockMovements.list(params, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}

export function useStockAdjustments(params: StockAdjustmentListParams) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.inventory.adjustments(scope, params),
    queryFn: ({ signal }) => api.stockAdjustments.list(params, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}

export function useStockTransfers(params: StockTransferListParams) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.inventory.transfers(scope, params),
    queryFn: ({ signal }) => api.stockTransfers.list(params, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}

/** Any stock change refreshes inventory, the POS stock on location products and the audit log. */
export function useInvalidateStock() {
  const queryClient = useQueryClient();
  const { ready: _r, ...scope } = useQueryScope();
  return () =>
    Promise.all(
      [
        queryKeys.inventory.all(scope),
        queryKeys.catalog.all(scope),
        queryKeys.audit.all(scope),
        // REC: ingredient stock drives "can make" and the prepared queue.
        queryKeys.recipes.all(scope),
        // BAK: raw materials and finished goods live on the same ledger.
        queryKeys.production.all(scope),
        // WHO: van stock, shop balances.
        queryKeys.wholesale.all(scope),
        // DEL: paying at the door moves stock; orders refresh with it.
        queryKeys.deliveries.all(scope),
        // HR: staff meals move stock; cash shifts follow the till.
        queryKeys.staff.all(scope),
        // REP: every report reads the ledger and orders.
        queryKeys.reports.all(scope),
        queryKeys.orders.all(scope),
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

function useStockMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const invalidate = useInvalidateStock();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useCreateAdjustment = () =>
  useStockMutation((body: CreateStockAdjustmentRequest) => api.stockAdjustments.create(body));
export const useSetMinStock = () =>
  useStockMutation(
    ({
      productId,
      locationId,
      minStock,
    }: {
      productId: string;
      locationId: string;
      minStock: number;
    }) => api.inventory.setMinStock(productId, locationId, { minStock }),
  );
export const useCreateTransfer = () =>
  useStockMutation((body: CreateStockTransferRequest) => api.stockTransfers.create(body));
export const useReceiveTransfer = () =>
  useStockMutation(({ id, body }: { id: string; body: ReceiveStockTransferRequest }) =>
    api.stockTransfers.receive(id, body),
  );
export const useCancelTransfer = () =>
  useStockMutation((id: string) => api.stockTransfers.cancel(id));
