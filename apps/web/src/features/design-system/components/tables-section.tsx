import { ApiError } from '@rbp/api-client';
import {
  Button,
  ButtonGroup,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FilterChip,
  MoneyText,
  Pagination,
  SearchInput,
  type SortState,
  StatusBadge,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { DownloadIcon, SearchXIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { DS_ORDER_STATUSES, DS_ORDERS, type DsOrder } from '../fixtures';
import { DsSection, Example } from './section';

type PreviewState = 'data' | 'loading' | 'empty' | 'error';
const PREVIEW_STATES: [PreviewState, string][] = [
  ['data', 'tables.stateData'],
  ['loading', 'tables.stateLoading'],
  ['empty', 'tables.stateEmpty'],
  ['error', 'tables.stateError'],
];
const PAGE_SIZE = 8;

function compare(a: DsOrder, b: DsOrder, columnId: string): number {
  switch (columnId) {
    case 'number':
      return a.number.localeCompare(b.number);
    case 'customer':
      return a.customer.localeCompare(b.customer);
    case 'items':
      return a.items - b.items;
    case 'total':
      return a.total.amount - b.total.amount;
    case 'placed':
      return a.placedAt.localeCompare(b.placedAt);
    default:
      return 0;
  }
}

export function TablesSection() {
  const { t, i18n } = useTranslation('designSystem');
  const locale = localeFor(i18n.language);
  const [preview, setPreview] = useState<PreviewState>('data');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState | null>({ columnId: 'placed', direction: 'desc' });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = DS_ORDERS.filter(
      (o) =>
        (!status || o.status === status) &&
        (!q || o.number.toLowerCase().includes(q) || o.customer.toLowerCase().includes(q)),
    );
    if (sort) {
      rows = [...rows].sort(
        (a, b) => compare(a, b, sort.columnId) * (sort.direction === 'asc' ? 1 : -1),
      );
    }
    return rows;
  }, [search, status, sort]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const columns: DataTableColumn<DsOrder>[] = [
    {
      id: 'number',
      header: t('tables.columns.number'),
      cell: (o) => <span className="font-medium">{o.number}</span>,
      sortable: true,
      primary: true,
    },
    {
      id: 'customer',
      header: t('tables.columns.customer'),
      cell: (o) => o.customer,
      sortable: true,
    },
    { id: 'type', header: t('tables.columns.type'), cell: (o) => o.type, hideOnTablet: true },
    {
      id: 'items',
      header: t('tables.columns.items'),
      cell: (o) => o.items,
      sortable: true,
      align: 'right',
      hideOnTablet: true,
      hideOnMobile: true,
    },
    {
      id: 'placed',
      header: t('tables.columns.placed'),
      cell: (o) => formatDateTime(o.placedAt, { locale }),
      sortable: true,
    },
    {
      id: 'status',
      header: t('tables.columns.status'),
      cell: (o) => <StatusBadge status={o.status} size="sm" />,
    },
    {
      id: 'total',
      header: t('tables.columns.total'),
      cell: (o) => <MoneyText value={o.total} locale={locale} />,
      sortable: true,
      align: 'right',
    },
  ];

  const resetPaging = () => setPage(1);

  return (
    <DsSection id="tables" title={t('sections.tables')}>
      <Example title={t('tables.caption')} className="space-y-3">
        {/* Segmented control (not tabs): it changes the table below rather than showing panels. */}
        <div className="scrollbar-none overflow-x-auto">
          <ButtonGroup aria-label={t('tables.stateLabel')}>
            {PREVIEW_STATES.map(([state, key]) => (
              <Button
                key={state}
                variant={preview === state ? 'default' : 'outline'}
                aria-pressed={preview === state}
                onClick={() => setPreview(state)}
              >
                {t(key)}
              </Button>
            ))}
          </ButtonGroup>
        </div>
        <DataTable
          caption={t('tables.caption')}
          columns={columns}
          rows={preview === 'empty' ? [] : pageRows}
          getRowId={(o) => o.id}
          getRowLabel={(o) => o.number}
          loading={preview === 'loading'}
          error={
            preview === 'error' ? (
              <QueryError
                error={new ApiError('NETWORK_ERROR', 'Network error', 0)}
                onRetry={() => setPreview('data')}
              />
            ) : undefined
          }
          empty={
            <EmptyState
              icon={SearchXIcon}
              title={t('tables.emptyTitle')}
              description={t('tables.emptyHint')}
            />
          }
          sort={sort}
          onSortChange={(s) => {
            setSort(s);
            resetPaging();
          }}
          selectedIds={selected}
          onSelectionChange={setSelected}
          labels={{ selectAll: t('tables.selectAll'), selectRow: t('tables.selectRow') }}
          toolbar={
            <FilterBar
              search={
                <SearchInput
                  value={search}
                  onValueChange={(v) => {
                    setSearch(v);
                    resetPaging();
                  }}
                  placeholder={t('tables.search')}
                  aria-label={t('tables.search')}
                />
              }
              filters={
                <>
                  <FilterChip
                    active={!status}
                    onClick={() => {
                      setStatus(null);
                      resetPaging();
                    }}
                  >
                    {t('tables.all')}
                  </FilterChip>
                  {DS_ORDER_STATUSES.map((s) => (
                    <FilterChip
                      key={s}
                      active={status === s}
                      onClick={() => {
                        setStatus(s);
                        resetPaging();
                      }}
                    >
                      <StatusBadge
                        status={s}
                        size="sm"
                        hideIcon
                        className="bg-transparent px-0 ring-0"
                      />
                    </FilterChip>
                  ))}
                </>
              }
              actions={
                <>
                  {selected.size > 0 && (
                    <span className="self-center text-sm text-muted-foreground">
                      {t('tables.selected', { count: selected.size })}
                    </span>
                  )}
                  <Button variant="outline">
                    <DownloadIcon /> {t('tables.export')}
                  </Button>
                </>
              }
            />
          }
          footer={
            preview === 'data' && filtered.length > 0 ? (
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={filtered.length}
                onPageChange={setPage}
                summary={(from, to, total) => t('tables.summary', { from, to, total })}
                previousLabel={t('tables.previous')}
                nextLabel={t('tables.next')}
                pageLabel={(p) => t('tables.page', { page: p })}
              />
            ) : undefined
          }
        />
      </Example>
    </DsSection>
  );
}
