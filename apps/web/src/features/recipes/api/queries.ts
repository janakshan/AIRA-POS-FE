import { queryKeys } from '@rbp/api-client';
import type {
  CreatePreparedItemRequest,
  DisposePreparedItemRequest,
  IngredientListParams,
  IngredientRequest,
  PreparedItemListParams,
  SaveRecipeRequest,
} from '@rbp/types';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { useInvalidateStock } from '@/features/inventory/api/queries';
import { api } from '@/lib/api';

/** REC-001…005. Every write can change stock or "can make", so it refreshes stock + recipes. */

export function useIngredients(params: IngredientListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.recipes.ingredients(scope, params),
    queryFn: ({ signal }) => api.ingredients.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useRecipes(locationId: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.recipes.list(scope, locationId),
    queryFn: ({ signal }) => api.recipes.list(locationId, signal),
    enabled: ready && !!locationId,
    placeholderData: keepPreviousData,
  });
}

export function useRecipe(productId: string | null | undefined, locationId: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.recipes.detail(scope, productId ?? '-', locationId),
    queryFn: ({ signal }) => api.recipes.get(productId ?? '', locationId, signal),
    enabled: ready && !!productId && !!locationId,
    retry: false,
  });
}

export function useRecipePlanning(locationId: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.recipes.planning(scope, locationId),
    queryFn: ({ signal }) => api.recipes.planning(locationId, signal),
    enabled: ready && !!locationId,
  });
}

export function usePreparedItems(params: PreparedItemListParams) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.recipes.prepared(scope, params),
    queryFn: ({ signal }) => api.preparedItems.list(params, signal),
    enabled: ready && !!params.locationId,
    placeholderData: keepPreviousData,
    // Expiry is time-based: keep the countdowns honest.
    refetchInterval: 60_000,
  });
}

function useRecipeMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const invalidate = useInvalidateStock();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useSaveIngredient = () =>
  useRecipeMutation(({ id, body }: { id?: string; body: IngredientRequest }) =>
    id ? api.ingredients.update(id, body) : api.ingredients.create(body),
  );

export const useSaveRecipe = () =>
  useRecipeMutation(
    ({
      productId,
      body,
      locationId,
    }: {
      productId: string;
      body: SaveRecipeRequest;
      locationId: string;
    }) => api.recipes.save(productId, body, locationId),
  );

export const useCreatePreparedItem = () =>
  useRecipeMutation((body: CreatePreparedItemRequest) => api.preparedItems.create(body));

export const useDisposePreparedItem = () =>
  useRecipeMutation(({ id, body }: { id: string; body: DisposePreparedItemRequest }) =>
    api.preparedItems.dispose(id, body),
  );
