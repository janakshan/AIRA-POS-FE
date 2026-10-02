import type { StockReportRow, StockStatus } from '@rbp/types';
import {
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterChip,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatCard,
} from '@rbp/ui';
import {
  PackageIcon,
  PackagePlusIcon,
  ShoppingCartIcon,
  Trash2Icon,
  UtensilsIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { StockStatusBadge } from '@/features/inventory/components/stock-status-badge';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useStockReport } from '../api/queries';
import { ReportShell } from '../components/report-shell';
import { downloadCsv, toCsv } from '../lib/csv';
import { fileStem, useReportParams } from '../lib/period';

const ANY = 'all';
const STATUSES: StockStatus[] = ['LOW', 'OUT'];
const n = (v: number) => (v ? String(v) : '—');

/**
 * REP-004 Stock report: for each item at each location, what it started the period with,
 * what came in and went out (and how), and what it ended with — straight from the ledger.
 */
export function StockReportPage() {
  const { t } = useTranslation('reports');
  const { nameOf } = useMyLocations();
  const rp = useReportParams(['category', 'status']);
  const categoryId = rp.list.filters.category ?? undefined;
  const status = STATUSES.find((s) => s === rp.list.filters.status);
  const report = useStockReport({
    ...rp.params,
    ...(categoryId ? { categoryId } : {}),
    ...(status ? { status } : {}),
  });
  const r = report.data;

  const inOf = (x: StockReportRow) => x.received + x.produced + x.returned;
  const columns: DataTableColumn<StockReportRow>[] = [
    {
      id: 'item',
      header: t('cols.item'),
      primary: true,
      cell: (x) => (
        <span>
          <span className="font-medium">{x.name}</span>
          <span className="block text-xs text-muted-foreground">
            {x.code} · {nameOf(x.locationId)}
          </span>
        </span>
      ),
    },
    {
      id: 'opening',
      header: t('cols.opening'),
      align: 'right',
      width: 'w-20',
      cell: (x) => <span className="tabular">{x.opening}</span>,
    },
    {
      id: 'in',
      header: t('cols.in'),
      align: 'right',
      width: 'w-16',
      hideOnTablet: true,
      cell: (x) => <span className="tabular">{n(inOf(x))}</span>,
    },
    {
      id: 'sold',
      header: t('cols.sold'),
      align: 'right',
      width: 'w-16',
      cell: (x) => <span className="tabular">{n(x.sold)}</span>,
    },
    {
      id: 'wasted',
      header: t('cols.wasted'),
      align: 'right',
      width: 'w-20',
      hideOnTablet: true,
      cell: (x) => <span className="tabular">{n(x.wasted)}</span>,
    },
    {
      id: 'meals',
      header: t('cols.staffMeals'),
      align: 'right',
      width: 'w-20',
      hideOnTablet: true,
      cell: (x) => <span className="tabular">{n(x.staffMeals)}</span>,
    },
    {
      id: 'other',
      header: t('cols.otherOut'),
      align: 'right',
      width: 'w-20',
      hideOnTablet: true,
      cell: (x) => <span className="tabular">{n(x.usedInProduction + x.transferredOut)}</span>,
    },
    {
      id: 'adjusted',
      header: t('cols.adjusted'),
      align: 'right',
      width: 'w-20',
      hideOnTablet: true,
      cell: (x) => (
        <span className="tabular">{x.adjusted > 0 ? `+${x.adjusted}` : n(x.adjusted)}</span>
      ),
    },
    {
      id: 'closing',
      header: t('cols.closing'),
      align: 'right',
      width: 'w-20',
      cell: (x) => <span className="font-semibold tabular">{x.closing}</span>,
    },
    {
      id: 'status',
      header: t('cols.status'),
      width: 'w-24',
      cell: (x) => <StockStatusBadge status={x.status} />,
    },
  ];

  const csv = () =>
    r &&
    downloadCsv(
      fileStem('stock', r.from, r.to),
      toCsv(r.rows, [
        { header: 'Code', value: (x) => x.code },
        { header: 'Item', value: (x) => x.name },
        { header: 'Location', value: (x) => nameOf(x.locationId) },
        { header: 'Unit', value: (x) => x.unit },
        { header: 'Opening', value: (x) => x.opening },
        { header: 'Received', value: (x) => x.received },
        { header: 'Produced', value: (x) => x.produced },
        { header: 'Returned', value: (x) => x.returned },
        { header: 'Sold', value: (x) => x.sold },
        { header: 'Transferred out', value: (x) => x.transferredOut },
        { header: 'Wasted', value: (x) => x.wasted },
        { header: 'Staff meals', value: (x) => x.staffMeals },
        { header: 'Used in production', value: (x) => x.usedInProduction },
        { header: 'Adjusted', value: (x) => x.adjusted },
        { header: 'Closing', value: (x) => x.closing },
        { header: 'On hand now', value: (x) => x.onHandNow },
        { header: 'Minimum', value: (x) => x.minStock },
        { header: 'Status', value: (x) => x.status },
      ]),
    );

  return (
    <ReportShell
      id="REP-004"
      title={t('stock.title')}
      description={t('stock.hint')}
      rp={rp}
      onCsv={() => void csv()}
      csvDisabled={!r?.rows.length}
      filters={
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={categoryId ?? ANY}
            onValueChange={(v) => rp.list.setFilter('category', v === ANY ? null : v)}
          >
            <SelectTrigger className="w-full sm:w-56" aria-label={t('cols.category')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t('products.anyCategory')}</SelectItem>
              {r?.categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {([null, ...STATUSES] as const).map((s) => (
            <FilterChip
              key={s ?? 'any'}
              active={(status ?? null) === s}
              onClick={() => rp.list.setFilter('status', s)}
            >
              {s ? t(`stock.status.${s}`) : t('stock.anyStatus')}
            </FilterChip>
          ))}
        </div>
      }
    >
      {report.isError ? (
        <QueryError error={report.error} onRetry={() => report.refetch()} />
      ) : !r ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label={t('stock.received')}
              icon={PackagePlusIcon}
              value={r.totals.received}
              hint={t('stock.units')}
            />
            <StatCard
              label={t('stock.sold')}
              icon={ShoppingCartIcon}
              value={r.totals.sold}
              hint={t('stock.units')}
            />
            <StatCard
              label={t('stock.wasted')}
              icon={Trash2Icon}
              value={r.totals.wasted}
              hint={t('stock.units')}
            />
            <StatCard
              label={t('stock.staffMeals')}
              icon={UtensilsIcon}
              value={r.totals.staffMeals}
              hint={t('stock.units')}
            />
          </div>
          <Card className="p-0">
            <DataTable
              caption={t('stock.caption')}
              columns={columns}
              rows={r.rows}
              getRowId={(x) => `${x.productId}:${x.locationId}`}
              getRowLabel={(x) => `${x.name} ${nameOf(x.locationId)}`}
              loading={false}
              empty={<EmptyState icon={PackageIcon} title={t('empty')} />}
            />
          </Card>
          <p className="text-xs text-muted-foreground">{t('stock.note')}</p>
        </>
      )}
    </ReportShell>
  );
}
