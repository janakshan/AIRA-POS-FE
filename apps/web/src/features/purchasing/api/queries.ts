import { queryKeys } from '@rbp/api-client';
import type {
  CancelPurchaseOrderRequest,
  GoodsReceiptListParams,
  PurchaseOrderListParams,
  PurchaseOrderRequest,
  ReceiveGoodsRequest,
  SupplierListParams,
  SupplierRequest,
} from '@rbp/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { useInvalidateStock } from '@/features/inventory/api/queries';
import { api } from '@/lib/api';

/** PUR-001…004 reads. Everything sits under one tenant prefix so any write refreshes it all. */

export function useSuppliers(params: SupplierListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.purchasing.suppliers(scope, params),
    queryFn: ({ signal }) => api.suppliers.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useSupplier(id: string | null | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.purchasing.supplier(scope, id ?? '-'),
    queryFn: ({ signal }) => api.suppliers.get(id ?? '', signal),
    enabled: ready && !!id,
  });
}

export function usePurchaseOrders(params: PurchaseOrderListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.purchasing.orders(scope, params),
    queryFn: ({ signal }) => api.purchaseOrders.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function usePurchaseOrder(id: string | null | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.purchasing.order(scope, id ?? '-'),
    queryFn: ({ signal }) => api.purchaseOrders.get(id ?? '', signal),
    enabled: ready && !!id,
  });
}

export function useGoodsReceipts(params: GoodsReceiptListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.purchasing.receipts(scope, params),
    queryFn: ({ signal }) => api.goodsReceipts.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useGoodsReceipt(id: string | null | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.purchasing.receipt(scope, id ?? '-'),
    queryFn: ({ signal }) => api.goodsReceipts.get(id ?? '', signal),
    enabled: ready && !!id,
  });
}

/** Purchasing writes change lists, supplier summaries and the audit log. */
function useInvalidatePurchasing() {
  const queryClient = useQueryClient();
  const { ready: _r, ...scope } = useQueryScope();
  return () =>
    Promise.all(
      [queryKeys.purchasing.all(scope), queryKeys.audit.all(scope)].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

function usePurchasingMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const invalidate = useInvalidatePurchasing();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useSaveSupplier = () =>
  usePurchasingMutation(({ id, body }: { id?: string; body: SupplierRequest }) =>
    id ? api.suppliers.update(id, body) : api.suppliers.create(body),
  );

export const useSetSupplierActive = () =>
  usePurchasingMutation(({ id, isActive }: { id: string; isActive: boolean }) =>
    api.suppliers.setActive(id, isActive),
  );

export const useSavePurchaseOrder = () =>
  usePurchasingMutation(({ id, body }: { id?: string; body: PurchaseOrderRequest }) =>
    id ? api.purchaseOrders.update(id, body) : api.purchaseOrders.create(body),
  );

export const usePlacePurchaseOrder = () =>
  usePurchasingMutation((id: string) => api.purchaseOrders.place(id));

export const useCancelPurchaseOrder = () =>
  usePurchasingMutation(({ id, body }: { id: string; body: CancelPurchaseOrderRequest }) =>
    api.purchaseOrders.cancel(id, body),
  );

/** PUR-004: a receipt is a stock change too — refresh stock screens and POS stock badges. */
export function useReceiveGoods() {
  const invalidatePurchasing = useInvalidatePurchasing();
  const invalidateStock = useInvalidateStock();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReceiveGoodsRequest }) =>
      api.purchaseOrders.receive(id, body),
    onSuccess: () => Promise.all([invalidatePurchasing(), invalidateStock()]),
  });
}
