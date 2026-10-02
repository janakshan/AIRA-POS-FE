import { queryKeys } from '@rbp/api-client';
import type { ProductSalesParams, ReportParams, StockReportParams } from '@rbp/types';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { api } from '@/lib/api';
import { periodError } from '../lib/period';

/** REP-001…005, REP-007. Read-only; stock and sale writes invalidate `reports.all`. */

function useReport<P extends ReportParams, R>(
  name: string,
  params: P,
  fn: (p: P, signal?: AbortSignal) => Promise<R>,
) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.reports.of(scope, name, { ...params }),
    queryFn: ({ signal }) => fn(params, signal),
    // An inverted or future period is refused in the filter; don't ask the server about it.
    enabled: ready && !(params.from && params.to && periodError(params.from, params.to)),
    placeholderData: keepPreviousData,
  });
}

export const useSalesReport = (p: ReportParams) => useReport('sales', p, api.reports.sales);
export const useProductReport = (p: ProductSalesParams) =>
  useReport('products', p, api.reports.products);
export const useLocationReport = (p: ReportParams) =>
  useReport('locations', p, api.reports.locations);
export const useStockReport = (p: StockReportParams) => useReport('stock', p, api.reports.stock);
export const useVoidsReport = (p: ReportParams) => useReport('voids', p, api.reports.voids);
export const useStaffReport = (p: ReportParams) => useReport('staff', p, api.reports.staff);
