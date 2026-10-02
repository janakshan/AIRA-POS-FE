import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronRightIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@rbp/utils';
import { Checkbox } from '../components/checkbox';
import { Skeleton } from '../components/skeleton';
import { useIsMobile } from '../hooks/use-media-query';

export type SortDirection = 'asc' | 'desc';
export interface SortState {
  columnId: string;
  direction: SortDirection;
}

export interface DataTableColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  /** Numbers and money are right-aligned and tabular. */
  align?: 'left' | 'right' | 'center';
  /** Tailwind width class, e.g. "w-32". */
  width?: string;
  /** Hide below 1280px to keep tablets from scrolling horizontally. */
  hideOnTablet?: boolean;
  /** Mobile card: rendered as the card title instead of a label/value row. */
  primary?: boolean;
  /** Mobile card: skip this column. */
  hideOnMobile?: boolean;
}

export interface DataTableLabels {
  selectAll: string;
  selectRow: string;
  sortAscending: string;
  sortDescending: string;
  loading: string;
}

const DEFAULT_LABELS: DataTableLabels = {
  selectAll: 'Select all rows',
  selectRow: 'Select row',
  sortAscending: 'Sorted ascending',
  sortDescending: 'Sorted descending',
  loading: 'Loading',
};

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[] | undefined;
  getRowId: (row: T) => string;
  /** Accessible table name. */
  caption: string;
  loading?: boolean;
  /** Rendered instead of rows (e.g. <QueryError />). */
  error?: React.ReactNode;
  /** Rendered when rows is an empty array (e.g. <EmptyState />). */
  empty?: React.ReactNode;
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  selectedIds?: ReadonlySet<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  /** Accessible name for a row's tap target on mobile, e.g. the product name. */
  getRowLabel?: (row: T) => string;
  /** Custom mobile card. Default: primary column as title + label/value rows. */
  mobileCard?: (row: T) => React.ReactNode;
  /** Filters/search above the table. */
  toolbar?: React.ReactNode;
  /** Pagination below the table. */
  footer?: React.ReactNode;
  skeletonRows?: number;
  labels?: Partial<DataTableLabels>;
  className?: string;
}

const alignClass = { left: 'text-left', right: 'text-right tabular', center: 'text-center' };

function nextSort(current: SortState | null | undefined, columnId: string): SortState | null {
  if (current?.columnId !== columnId) return { columnId, direction: 'asc' };
  if (current.direction === 'asc') return { columnId, direction: 'desc' };
  return null;
}

/**
 * Admin data table. Desktop/tablet: a table with sticky header. Below 768px: stacked cards,
 * so the page never scrolls horizontally. Sorting and paging are controlled by the caller
 * (server-side ready).
 */
export function DataTable<T>({
  columns,
  rows,
  getRowId,
  caption,
  loading,
  error,
  empty,
  sort,
  onSortChange,
  selectedIds,
  onSelectionChange,
  onRowClick,
  getRowLabel,
  mobileCard,
  toolbar,
  footer,
  skeletonRows = 5,
  labels: labelOverrides,
  className,
}: DataTableProps<T>) {
  const mobile = useIsMobile();
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const selectable = !!onSelectionChange;
  const ids = rows?.map(getRowId) ?? [];
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds?.has(id));
  const someSelected = !allSelected && ids.some((id) => selectedIds?.has(id));

  const toggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange?.(next);
  };
  const toggleAll = () => onSelectionChange?.(allSelected ? new Set() : new Set(ids));

  const showEmpty = !loading && !error && rows?.length === 0;
  const showRows = !loading && !error && rows && rows.length > 0;

  let body: React.ReactNode;
  if (error) {
    body = <div className="p-2">{error}</div>;
  } else if (showEmpty) {
    body = <div className="p-2">{empty}</div>;
  } else if (mobile) {
    body = (
      <ul aria-label={caption} aria-busy={loading || undefined} className="divide-y">
        {loading || !rows
          ? Array.from({ length: skeletonRows }, (_, i) => (
              <li key={i} className="space-y-2 p-4">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-3/4" />
              </li>
            ))
          : rows.map((row) => {
              const id = getRowId(row);
              return (
                <li key={id} className="relative flex items-start gap-3 p-4">
                  {selectable && (
                    <Checkbox
                      className="z-10 mt-0.5"
                      aria-label={labels.selectRow}
                      checked={selectedIds?.has(id) ?? false}
                      onCheckedChange={() => toggleRow(id)}
                    />
                  )}
                  {/* Above the row button, but click-through except on the card's own controls. */}
                  <div className="pointer-events-none relative z-[1] min-w-0 flex-1 [&_:is(a,button,input,select,textarea,label,[role=button],[role=checkbox],[role=switch],[role=combobox])]:pointer-events-auto">
                    {mobileCard ? mobileCard(row) : <DefaultCard columns={columns} row={row} />}
                  </div>
                  {onRowClick && (
                    <button
                      type="button"
                      onClick={() => onRowClick(row)}
                      className="absolute inset-0 rounded-none focus-ring"
                      aria-label={getRowLabel?.(row) ?? id}
                    >
                      <ChevronRightIcon className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    </button>
                  )}
                </li>
              );
            })}
      </ul>
    );
  } else {
    body = (
      // Focusable + labelled so keyboard users can scroll a table wider than its card.
      <div
        className="relative max-h-[inherit] overflow-auto focus-ring"
        tabIndex={0}
        role="region"
        aria-label={caption}
      >
        <table className="w-full caption-bottom text-sm" aria-busy={loading || undefined}>
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-sticky bg-card shadow-[inset_0_-1px_0_var(--border)]">
            <tr>
              {selectable && (
                <th scope="col" className="w-12 px-3">
                  <Checkbox
                    aria-label={labels.selectAll}
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    disabled={!showRows}
                  />
                </th>
              )}
              {columns.map((col) => {
                const active = sort?.columnId === col.id ? sort.direction : undefined;
                return (
                  <th
                    key={col.id}
                    scope="col"
                    aria-sort={
                      active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined
                    }
                    className={cn(
                      'h-11 px-3 text-overline whitespace-nowrap text-muted-foreground uppercase',
                      alignClass[col.align ?? 'left'],
                      col.width,
                      col.hideOnTablet && 'hidden xl:table-cell',
                    )}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(nextSort(sort, col.id))}
                        className={cn(
                          '-mx-1.5 inline-flex touch-safe items-center gap-1 rounded px-1.5 py-1 uppercase focus-ring hover:text-foreground',
                          active && 'text-foreground',
                        )}
                      >
                        {col.header}
                        {active === 'asc' ? (
                          <ArrowUpIcon className="size-3.5" aria-label={labels.sortAscending} />
                        ) : active === 'desc' ? (
                          <ArrowDownIcon className="size-3.5" aria-label={labels.sortDescending} />
                        ) : (
                          <ArrowUpDownIcon className="size-3.5 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {loading || !rows
              ? Array.from({ length: skeletonRows }, (_, r) => (
                  <tr key={r} className="border-b">
                    {selectable && <td className="px-3 py-3.5" />}
                    {columns.map((col, c) => (
                      <td
                        key={col.id}
                        className={cn('px-3 py-3.5', col.hideOnTablet && 'hidden xl:table-cell')}
                      >
                        <Skeleton
                          className={cn(
                            'h-4',
                            c === 0 ? 'w-3/4' : 'w-1/2',
                            col.align === 'right' && 'ml-auto',
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => {
                  const id = getRowId(row);
                  const selected = selectedIds?.has(id) ?? false;
                  return (
                    <tr
                      key={id}
                      data-state={selected ? 'selected' : undefined}
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-primary/5',
                        onRowClick && 'cursor-pointer',
                      )}
                    >
                      {selectable && (
                        <td className="px-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            aria-label={labels.selectRow}
                            checked={selected}
                            onCheckedChange={() => toggleRow(id)}
                          />
                        </td>
                      )}
                      {columns.map((col) => (
                        <td
                          key={col.id}
                          className={cn(
                            'px-3 py-3 whitespace-nowrap',
                            alignClass[col.align ?? 'left'],
                            col.hideOnTablet && 'hidden xl:table-cell',
                          )}
                        >
                          {col.cell(row)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {toolbar}
      <div data-slot="data-table" className="overflow-hidden rounded-xl border bg-card shadow-xs">
        {body}
        {loading && (
          <span className="sr-only" role="status">
            {labels.loading}
          </span>
        )}
      </div>
      {footer}
    </div>
  );
}

function DefaultCard<T>({ columns, row }: { columns: DataTableColumn<T>[]; row: T }) {
  const primary = columns.find((c) => c.primary) ?? columns[0];
  const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
  return (
    <div className="space-y-2 pr-6">
      {primary && <div className="font-medium">{primary.cell(row)}</div>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rest.map((col) => (
          <div key={col.id} className="contents">
            <dt className="text-muted-foreground">{col.header}</dt>
            <dd className={cn('min-w-0 text-right', col.align === 'right' && 'tabular')}>
              {col.cell(row)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
