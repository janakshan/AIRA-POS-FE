import { queryKeys } from '@rbp/api-client';
import type {
  CancelProductionRequest,
  CompleteBatchRequest,
  CreateWastageRequest,
  ProductionBatchListParams,
  ProductionPlanListParams,
  ProductionPlanRequest,
  StartBatchRequest,
  WastageListParams,
} from '@rbp/types';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { useInvalidateStock } from '@/features/inventory/api/queries';
import { api } from '@/lib/api';

/** BAK-001…005. Every write can move stock, so it refreshes stock + production together. */

export function useProductionSummary(locationId: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.production.summary(scope, locationId),
    queryFn: ({ signal }) => api.production.summary(locationId, signal),
    enabled: ready && !!locationId,
    placeholderData: keepPreviousData,
  });
}

export function useProductionFormulas(locationId: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.production.formulas(scope, locationId),
    queryFn: ({ signal }) => api.production.formulas(locationId, signal),
    enabled: ready && !!locationId,
    staleTime: 5 * 60_000,
  });
}

export function useProductionPlans(params: ProductionPlanListParams) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.production.plans(scope, params),
    queryFn: ({ signal }) => api.production.plans.list(params, signal),
    enabled: ready && !!params.locationId,
    placeholderData: keepPreviousData,
  });
}

export function useProductionPlan(id: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.production.plan(scope, id ?? '-'),
    queryFn: ({ signal }) => api.production.plans.get(id ?? '', signal),
    enabled: ready && !!id,
  });
}

export function useProductionBatches(params: ProductionBatchListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.production.batches(scope, params),
    queryFn: ({ signal }) => api.production.batches.list(params, signal),
    enabled: ready && enabled && !!params.locationId,
    placeholderData: keepPreviousData,
  });
}

export function useProductionBatch(id: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.production.batch(scope, id ?? '-'),
    queryFn: ({ signal }) => api.production.batches.get(id ?? '', signal),
    enabled: ready && !!id,
  });
}

export function useFinishedGoods(locationId: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.production.finishedGoods(scope, locationId),
    queryFn: ({ signal }) => api.production.finishedGoods(locationId, signal),
    enabled: ready && !!locationId,
    placeholderData: keepPreviousData,
  });
}

export function useWastage(params: WastageListParams) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.production.wastage(scope, params),
    queryFn: ({ signal }) => api.production.wastage.list(params, signal),
    enabled: ready && !!params.locationId,
    placeholderData: keepPreviousData,
  });
}

function useProductionMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const invalidate = useInvalidateStock();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useSaveProductionPlan = () =>
  useProductionMutation(({ id, body }: { id?: string; body: ProductionPlanRequest }) =>
    id ? api.production.plans.update(id, body) : api.production.plans.create(body),
  );

export const useConfirmProductionPlan = () =>
  useProductionMutation((id: string) => api.production.plans.confirm(id));

export const useCancelProductionPlan = () =>
  useProductionMutation(({ id, body }: { id: string; body: CancelProductionRequest }) =>
    api.production.plans.cancel(id, body),
  );

export const useStartBatch = () =>
  useProductionMutation(({ id, body }: { id: string; body: StartBatchRequest }) =>
    api.production.batches.start(id, body),
  );

export const useCompleteBatch = () =>
  useProductionMutation(({ id, body }: { id: string; body: CompleteBatchRequest }) =>
    api.production.batches.complete(id, body),
  );

export const useCancelBatch = () =>
  useProductionMutation(({ id, body }: { id: string; body: CancelProductionRequest }) =>
    api.production.batches.cancel(id, body),
  );

export const useCreateWastage = () =>
  useProductionMutation((body: CreateWastageRequest) => api.production.wastage.create(body));
