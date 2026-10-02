import { queryKeys } from '@rbp/api-client';
import type {
  CategoryListParams,
  CategoryTreeParams,
  CreateCategoryRequest,
  CreateProductRequest,
  LocationProduct,
  LocationProductListParams,
  PriceMatrixParams,
  ProductListParams,
  UpdateCategoryRequest,
  UpdateLocationProductRequest,
  UpdatePricesRequest,
  UpdateProductRequest,
  UpdateQuickPadLayoutRequest,
} from '@rbp/types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { api } from '@/lib/api';

/** Catalog server state. Components use these hooks only — never `api` or fetch directly. */

const CATALOG_STALE_MS = 5 * 60_000;

export function useCategories(params: CategoryListParams = {}) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.catalog.categories(scope, params),
    queryFn: ({ signal }) => api.catalog.categories.list(params, signal),
    enabled: ready,
    staleTime: CATALOG_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

/** Whole category tree in display order (CAT-001, parent pickers, POS rail). */
export function useCategoryTree(params: CategoryTreeParams = {}) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.catalog.categoryTree(scope, params),
    queryFn: ({ signal }) => api.catalog.categories.tree(params, signal),
    enabled: ready,
    staleTime: CATALOG_STALE_MS,
  });
}

export function useProducts(params: ProductListParams = {}) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.catalog.products(scope, params),
    queryFn: ({ signal }) => api.catalog.products.list(params, signal),
    enabled: ready,
    staleTime: CATALOG_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.catalog.product(scope, id ?? '-'),
    queryFn: ({ signal }) => api.catalog.products.get(id ?? '', signal),
    enabled: ready && !!id,
    staleTime: CATALOG_STALE_MS,
  });
}

/**
 * What a location sells, at its effective price. Defaults to the current location
 * (POS Quick Pad); CAT-005 passes `{ locationId, all: true }`.
 */
export function useLocationProducts(params: LocationProductListParams = {}) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.catalog.locationProducts(scope, params),
    queryFn: ({ signal }) => api.catalog.locationProducts.list(params, signal),
    enabled: ready,
    staleTime: CATALOG_STALE_MS,
  });
}

export function usePriceMatrix(params: PriceMatrixParams = {}) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.catalog.priceMatrix(scope, params),
    queryFn: ({ signal }) => api.catalog.prices.matrix(params, signal),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
}

/** Resolved layout for a location, or one device there (device → location → default). */
export function useQuickPadLayout(
  locationId: string | null | undefined,
  deviceId: string | null = null,
) {
  const { ready, ...scope } = useQueryScope();
  const target = locationId ?? scope.locationId;
  return useQuery({
    queryKey: queryKeys.catalog.quickPadLayout(scope, target, deviceId),
    queryFn: ({ signal }) => api.catalog.quickPad.get(target ?? '', deviceId, signal),
    enabled: ready && !!target,
    staleTime: CATALOG_STALE_MS,
  });
}

function useInvalidateCatalog() {
  const queryClient = useQueryClient();
  const { tenantId } = useQueryScope();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.catalog.all({ tenantId }) }),
      // Every catalog write is audited.
      queryClient.invalidateQueries({ queryKey: queryKeys.audit.all({ tenantId }) }),
    ]);
}

export function useCreateCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (body: CreateCategoryRequest) => api.catalog.categories.create(body),
    onSuccess: invalidate,
  });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateCategoryRequest }) =>
      api.catalog.categories.update(id, body),
    onSuccess: invalidate,
  });
}

export function useCreateProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (body: CreateProductRequest) => api.catalog.products.create(body),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProductRequest }) =>
      api.catalog.products.update(id, body),
    onSuccess: invalidate,
  });
}

/** CAT-005 row toggle. Optimistic so switches feel instant; rolled back on error. */
export function useUpdateLocationProduct(locationId: string) {
  const queryClient = useQueryClient();
  const { ready: _ready, ...scope } = useQueryScope();
  const invalidate = useInvalidateCatalog();
  const key = queryKeys.catalog.locationProducts(scope, { locationId, all: true });
  return useMutation({
    mutationFn: ({ productId, body }: { productId: string; body: UpdateLocationProductRequest }) =>
      api.catalog.locationProducts.update(productId, locationId, body),
    onMutate: async ({ productId, body }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<LocationProduct[]>(key);
      queryClient.setQueryData<LocationProduct[]>(key, (rows) =>
        rows?.map((r) =>
          r.productId === productId
            ? {
                ...r,
                ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
                ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
                ...(body.serviceCharge !== undefined ? { serviceCharge: body.serviceCharge } : {}),
                ...(body.stationId !== undefined ? { stationId: body.stationId } : {}),
              }
            : r,
        ),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: invalidate,
  });
}

export function useUpdatePrices() {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (body: UpdatePricesRequest) => api.catalog.prices.update(body),
    onSuccess: invalidate,
  });
}

export function useUpdateQuickPadLayout(locationId: string, deviceId: string | null = null) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (body: UpdateQuickPadLayoutRequest) =>
      api.catalog.quickPad.update(locationId, body, deviceId),
    onSuccess: invalidate,
  });
}

export function useResetDeviceLayout(locationId: string) {
  const invalidate = useInvalidateCatalog();
  return useMutation({
    mutationFn: (deviceId: string) => api.catalog.quickPad.resetDevice(locationId, deviceId),
    onSuccess: invalidate,
  });
}

/** KOT stations (and printers) at a location. */
export function useKitchenStations(locationId: string | null | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.catalog.kitchenStations(scope, locationId),
    queryFn: ({ signal }) => api.catalog.kitchenStations.list(locationId ?? '', signal),
    enabled: ready && !!locationId,
    staleTime: CATALOG_STALE_MS,
  });
}

/** Devices registered at a location (per-device Quick Pad layouts). */
export function useDevices(locationId: string | null | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.devices(scope, locationId),
    queryFn: ({ signal }) => api.identity.devices(locationId ?? undefined, signal),
    enabled: ready && !!locationId,
    staleTime: CATALOG_STALE_MS,
  });
}
