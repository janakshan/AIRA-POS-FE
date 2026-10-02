import { queryKeys } from '@rbp/api-client';
import type {
  ShareInvoiceRequest,
  VoidWholesaleInvoiceRequest,
  WholesaleCollectionListParams,
  WholesaleCollectionRequest,
  WholesaleInvoiceListParams,
  WholesaleInvoiceRequest,
  WholesalePriceListParams,
  WholesalePriceRequest,
  WholesaleReturnListParams,
  WholesaleReturnRequest,
  WholesaleShopListParams,
  WholesaleShopRequest,
} from '@rbp/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { useInvalidateStock } from '@/features/inventory/api/queries';
import { api } from '@/lib/api';

/** WHO-001…006. Sales and returns move van stock, so writes refresh stock + wholesale. */

export function useWholesaleRoutes() {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.routes(scope),
    queryFn: ({ signal }) => api.wholesale.routes.list(signal),
    enabled: ready,
    staleTime: 5 * 60_000,
  });
}

export function useRouteOverview(routeId: string, date: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.overview(scope, routeId, date),
    queryFn: ({ signal }) => api.wholesale.routes.overview(routeId, date, signal),
    enabled: ready && !!routeId,
    placeholderData: keepPreviousData,
  });
}

export function useShops(params: WholesaleShopListParams = {}) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.shops(scope, params),
    queryFn: ({ signal }) => api.wholesale.shops.list(params, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}

export function useShop(id: string | null | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.shop(scope, id ?? '-'),
    queryFn: ({ signal }) => api.wholesale.shops.get(id ?? '', signal),
    enabled: ready && !!id,
  });
}

export function useShopLedger(id: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.ledger(scope, id ?? '-'),
    queryFn: ({ signal }) => api.wholesale.shops.ledger(id ?? '', signal),
    enabled: ready && !!id,
  });
}

export function useWholesaleProducts(locationId: string | undefined, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.products(scope, locationId ?? '-'),
    queryFn: ({ signal }) => api.wholesale.products(locationId, signal),
    enabled: ready && enabled,
  });
}

/** A-310 the price list (needs wholesale.prices). */
export function useWholesalePrices(params: WholesalePriceListParams = {}) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.prices(scope, params),
    queryFn: ({ signal }) => api.wholesale.prices.list(params, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}

export function useInvoices(params: WholesaleInvoiceListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.invoices(scope, params),
    queryFn: ({ signal }) => api.wholesale.invoices.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.invoice(scope, id ?? '-'),
    queryFn: ({ signal }) => api.wholesale.invoices.get(id ?? '', signal),
    enabled: ready && !!id,
  });
}

export function useCollections(params: WholesaleCollectionListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.collections(scope, params),
    queryFn: ({ signal }) => api.wholesale.collections.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useReturns(params: WholesaleReturnListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.returns(scope, params),
    queryFn: ({ signal }) => api.wholesale.returns.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useReturn(id: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.wholesale.return(scope, id ?? '-'),
    queryFn: ({ signal }) => api.wholesale.returns.get(id ?? '', signal),
    enabled: ready && !!id,
  });
}

function useWholesaleMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const invalidate = useInvalidateStock();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

/** Shop edits don't move stock: refresh wholesale only. */
export function useSaveShop() {
  const queryClient = useQueryClient();
  const { ready: _r, ...scope } = useQueryScope();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: WholesaleShopRequest }) =>
      id ? api.wholesale.shops.update(id, body) : api.wholesale.shops.create(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.wholesale.all(scope) }),
  });
}

export const useCreateInvoice = () =>
  useWholesaleMutation((body: WholesaleInvoiceRequest) => api.wholesale.invoices.create(body));

export const useShareInvoice = () =>
  useWholesaleMutation(({ id, body }: { id: string; body: ShareInvoiceRequest }) =>
    api.wholesale.invoices.share(id, body),
  );

export const usePrintInvoice = () =>
  useWholesaleMutation((id: string) => api.wholesale.invoices.print(id));

export const useCreateCollection = () =>
  useWholesaleMutation((body: WholesaleCollectionRequest) =>
    api.wholesale.collections.create(body),
  );

export const useCreateReturn = () =>
  useWholesaleMutation((body: WholesaleReturnRequest) => api.wholesale.returns.create(body));

/** A-310: prices don't move stock; refresh wholesale (van products, price list) and the audit log. */
export function useUpdateWholesalePrice() {
  const queryClient = useQueryClient();
  const { ready: _r, ...scope } = useQueryScope();
  return useMutation({
    mutationFn: ({ productId, body }: { productId: string; body: WholesalePriceRequest }) =>
      api.wholesale.prices.update(productId, body),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.wholesale.all(scope) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.audit.all(scope) }),
      ]),
  });
}

/** A-311: puts the goods back into the van and changes the shop's balance. */
export const useVoidInvoice = () =>
  useWholesaleMutation(({ id, body }: { id: string; body: VoidWholesaleInvoiceRequest }) =>
    api.wholesale.invoices.void(id, body),
  );
