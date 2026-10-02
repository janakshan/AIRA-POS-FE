import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { QueryError } from './query-error';

interface QueryBoundaryProps<T> {
  query: Pick<UseQueryResult<T>, 'data' | 'error' | 'isError' | 'refetch'>;
  /** Skeleton matching the final layout (TableSkeleton, FormSkeleton, PageSkeleton…). */
  loading: ReactNode;
  /** Shown when `isEmpty(data)` is true. */
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  children: (data: T) => ReactNode;
}

/**
 * Standard loading → error → empty → data switch for a TanStack query, so every screen
 * handles the four states the same way.
 */
export function QueryBoundary<T>({
  query,
  loading,
  empty,
  isEmpty,
  children,
}: QueryBoundaryProps<T>) {
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data === undefined) return <>{loading}</>;
  if (empty !== undefined && isEmpty?.(query.data)) return <>{empty}</>;
  return <>{children(query.data)}</>;
}
