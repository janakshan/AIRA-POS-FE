import type { ProductSalesRow } from '@rbp/types';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  type DataTableColumn,
  EmptyState,
  MoneyText,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatCard,
} from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { PackageIcon, PercentIcon, TrendingUpIcon, Undo2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { useProductReport } from '../api/queries';
import { RankBars } from '../components/bar-chart';
import { ReportShell } from '../components/report-shell';
import { csvMoney, downloadCsv, toCsv } from '../lib/csv';
import { fileStem, useReportParams } from '../lib/period';
import { sharePct } from '../lib/share';

const ANY = 'all';
const pct = (bps: number) => `${sharePct(bps)}%`;

/** REP-002 Product sales: what sold, what came back, and what each item earned. */
export function ProductSalesPage() {
  const { t, i18n } = useTranslation('reports');
  const locale = localeFor(i18n.language);
  const rp = useReportParams(['category']);
  const categoryId = rp.list.filters.category ?? undefined;
  const report = useProductReport({ ...rp.params, ...(categoryId ? { categoryId } : {}) });
  const r = report.data;

  const columns: DataTableColumn<ProductSalesRow>[] = [
    {
      id: 'name',
      header: t('cols.product'),
      primary: true,
      cell: (x) => (
        <span>
          <span className="font-medium">{x.name}</span>
          <span className="block text-xs text-muted-foreground">
            {x.code} · {x.categoryName}
          </span>
        </span>
      ),
    },
    {
      id: 'sold',
      header: t('cols.sold'),
      align: 'right',
      width: 'w-20',
      cell: (x) => <span className="tabular">{x.sold}</span>,
    },
    {
      id: 'returned',
      header: t('cols.returned'),
      align: 'right',
      width: 'w-24',
      hideOnTablet: true,
      cell: (x) => <span className="tabular">{x.returned || '—'}</span>,
    },
    {
      id: 'gross',
      header: t('cols.gross'),
      align: 'right',
      width: 'w-32',
      hideOnTablet: true,
      cell: (x) => <MoneyText value={x.gross} locale={locale} />,
    },
    {
      id: 'discount',
      header: t('cols.discounts'),
      align: 'right',
      width: 'w-28',
      hideOnTablet: true,
      cell: (x) => (x.discount.amount ? <MoneyText value={x.discount} locale={locale} /> : '—'),
    },
    {
      id: 'net',
      header: t('cols.net'),
      align: 'right',
      width: 'w-32',
      cell: (x) => <MoneyText value={x.net} locale={locale} className="font-semibold" />,
    },
    {
      id: 'share',
      header: t('cols.share'),
      align: 'right',
      width: 'w-20',
      cell: (x) => <span className="tabular">{pct(x.shareBps)}</span>,
    },
  ];

  const csv = () =>
    r &&
    downloadCsv(
      fileStem('product-sales', r.from, r.to),
      toCsv(r.rows, [
        { header: 'Code', value: (x) => x.code },
        { header: 'Product', value: (x) => x.name },
        { header: 'Category', value: (x) => x.categoryName },
        { header: 'Sold', value: (x) => x.sold },
        { header: 'Returned', value: (x) => x.returned },
        { header: 'Net quantity', value: (x) => x.netQuantity },
        { header: 'Gross', value: (x) => csvMoney(x.gross) },
        { header: 'Discounts', value: (x) => csvMoney(x.discount) },
        { header: 'Refunded', value: (x) => csvMoney(x.refunded) },
        { header: 'Net', value: (x) => csvMoney(x.net) },
        { header: 'Share %', value: (x) => sharePct(x.shareBps) },
      ]),
    );

  return (
    <ReportShell
      id="REP-002"
      title={t('products.title')}
      description={t('products.hint')}
      rp={rp}
      onCsv={() => void csv()}
      csvDisabled={!r?.rows.length}
      filters={
        <div className="space-y-1.5">
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
              label={t('products.net')}
              icon={TrendingUpIcon}
              value={<MoneyText value={r.totals.net} locale={locale} />}
            />
            <StatCard label={t('products.units')} icon={PackageIcon} value={r.totals.sold} />
            <StatCard
              label={t('products.returnedUnits')}
              icon={Undo2Icon}
              value={r.totals.returned}
            />
            <StatCard
              label={t('products.discounts')}
              icon={PercentIcon}
              value={<MoneyText value={r.totals.discount} locale={locale} />}
            />
          </div>
          {r.rows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('products.top')}</CardTitle>
              </CardHeader>
              <CardContent>
                <RankBars
                  caption={t('products.top')}
                  data={r.rows.slice(0, 10).map((x) => ({
                    key: x.productId,
                    label: x.name,
                    title: x.name,
                    value: x.net.amount,
                    display: formatMoney(x.net, locale),
                  }))}
                />
              </CardContent>
            </Card>
          )}
          <Card className="p-0">
            <DataTable
              caption={t('products.caption')}
              columns={columns}
              rows={r.rows}
              getRowId={(x) => x.productId}
              getRowLabel={(x) => x.name}
              loading={false}
              empty={<EmptyState icon={PackageIcon} title={t('empty')} />}
            />
          </Card>
        </>
      )}
    </ReportShell>
  );
}
