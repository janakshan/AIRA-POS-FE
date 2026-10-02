import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';

export interface ListParamsState {
  page: number;
  pageSize: number;
  search: string;
  filters: Record<string, string>;
}

/**
 * List-page state in the URL so filters survive reloads and links are shareable.
 * Changing search or a filter resets to page 1.
 */
export function useListParams(defaults: { pageSize?: number; filterKeys?: string[] } = {}) {
  const [params, setParams] = useSearchParams();
  const pageSize = defaults.pageSize ?? 25;
  const filterKeys = defaults.filterKeys ?? [];

  const state: ListParamsState = useMemo(() => {
    return {
      page: Math.max(1, Number(params.get('page')) || 1),
      pageSize: Number(params.get('pageSize')) || pageSize,
      search: params.get('q') ?? '',
      filters: Object.fromEntries(
        filterKeys.flatMap((k) => {
          const v = params.get(k);
          return v ? [[k, v]] : [];
        }),
      ),
    };
    // filterKeys is static per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, pageSize]);

  const update = useCallback(
    (patch: Record<string, string | number | null>, resetPage = true) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage) next.delete('page');
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return {
    ...state,
    setPage: (page: number) => update({ page: page === 1 ? null : page }, false),
    setSearch: (search: string) => update({ q: search }),
    setFilter: (key: string, value: string | null) => update({ [key]: value }),
    /** Several filters in one URL update (e.g. a date range). */
    setFilters: (patch: Record<string, string | null>) => update(patch),
  };
}
