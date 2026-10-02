import type { Money } from '@rbp/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardGridSkeleton,
  MoneyText,
  StatCard,
} from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { PercentIcon, ReceiptIcon, ShoppingBagIcon, TrendingUpIcon, Undo2Icon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { useSalesReport } from '../api/queries';
import { BarChart } from '../components/bar-chart';
import { Breakdown } from '../components/breakdown';
import { ReportShell } from '../components/report-shell';
import { csvMoney, downloadCsv, toCsv } from '../lib/csv';
import { fileStem, useReportParams } from '../lib/period';

/**
 * REP-001 Sales summary: net POS sales for a period (paid, less refunds), how they were paid,
 * what kind of orders, who rang them up, when — plus wholesale and staff meals alongside.
 */
export function SalesSummaryPage() {
  const { t, i18n } = useTranslation('reports');
  const locale = localeFor(i18n.language);
  const rp = useReportParams();
  const report = useSalesReport(rp.params);
  const r = report.data;
  const m = (v: Money) => formatMoney(v, locale);

  const csv = () => {
    if (!r) return;
    const rows: [string, string, string | number][] = [
      ['Totals', 'Gross sales', csvMoney(r.totals.gross)],
      ['Totals', 'Discounts', csvMoney(r.totals.discounts)],
      ['Totals', 'Service & other charges', csvMoney(r.totals.charges)],
      ['Totals', 'Tax', csvMoney(r.totals.tax)],
      ['Totals', 'Sales', csvMoney(r.totals.sales)],
      ['Totals', 'Refunds', csvMoney(r.totals.refunds)],
      ['Totals', 'Net sales', csvMoney(r.totals.net)],
      ['Totals', 'Orders', r.totals.orders],
      ['Totals', 'Average order', csvMoney(r.totals.averageOrder)],
      ...r.byDay.map((d): [string, string, string] => ['Net by day', d.date, csvMoney(d.net)]),
      ...r.byPayment.map((p): [string, string, string] => [
        'Payment method',
        // Same labels as on screen, not internal codes (BANK_TRANSFER, RETAIL → "Counter").
        t(`method.${p.method}`),
        csvMoney(p.net),
      ]),
      ...r.byType.map((p): [string, string, string] => [
        'Order type',
        t(`orderType.${p.type}`),
        csvMoney(p.net),
      ]),
      ...r.byCashier.map((p): [string, string, string] => ['Cashier', p.name, csvMoney(p.net)]),
      ['Other channels', 'Wholesale invoices', csvMoney(r.channels.wholesale.total)],
      ['Other channels', 'Staff meals (at sale price)', csvMoney(r.channels.staffMeals.value)],
    ];
    downloadCsv(
      fileStem('sales-summary', r.from, r.to),
      toCsv(rows, [
        { header: 'Section', value: (x) => x[0] },
        { header: 'Item', value: (x) => x[1] },
        { header: 'Value', value: (x) => x[2] },
      ]),
    );
  };

  return (
    <ReportShell
      id="REP-001"
      title={t('sales.title')}
      description={t('sales.hint')}
      rp={rp}
      onCsv={csv}
      csvDisabled={!r}
    >
      {report.isError ? (
        <QueryError error={report.error} onRetry={() => report.refetch()} />
      ) : !r ? (
        <CardGridSkeleton />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <StatCard
              label={t('sales.net')}
              icon={TrendingUpIcon}
              value={<MoneyText value={r.totals.net} locale={locale} />}
              hint={t('sales.netHint', { sales: m(r.totals.sales) })}
            />
            <StatCard
              label={t('sales.orders')}
              icon={ReceiptIcon}
              value={r.totals.orders}
              hint={t('sales.items', { count: r.totals.items })}
            />
            <StatCard
              label={t('sales.average')}
              icon={ShoppingBagIcon}
              value={<MoneyText value={r.totals.averageOrder} locale={locale} />}
            />
            <StatCard
              label={t('sales.discounts')}
              icon={PercentIcon}
              value={<MoneyText value={r.totals.discounts} locale={locale} />}
            />
            <StatCard
              label={t('sales.refunds')}
              icon={Undo2Icon}
              value={<MoneyText value={r.totals.refunds} locale={locale} />}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('sales.byDay')}</CardTitle>
              <CardDescription>{t('sales.byDayHint')}</CardDescription>
            </CardHeader>
            <CardContent>
              <BarChart
                caption={t('sales.byDay')}
                emptyLabel={t('empty')}
                labelEvery={Math.ceil(r.byDay.length / 10)}
                data={r.byDay.map((d) => ({
                  key: d.date,
                  label: d.date.slice(8),
                  title: formatPlainDate(d.date, locale),
                  value: d.net.amount,
                  display: `${m(d.net)} · ${t('sales.ordersCount', { count: d.orders })}`,
                }))}
              />
            </CardContent>
          </Card>

          <div className="grid items-start gap-section lg:grid-cols-2">
            <Breakdown
              title={t('sales.byPayment')}
              headers={[t('cols.method'), t('cols.count'), t('cols.refunds'), t('cols.net')]}
              rows={r.byPayment.map((p) => ({
                key: p.method,
                cells: [t(`method.${p.method}`), p.count, m(p.refunds), m(p.net)],
              }))}
            />
            <Breakdown
              title={t('sales.byType')}
              headers={[t('cols.type'), t('cols.orders'), t('cols.net')]}
              rows={r.byType.map((p) => ({
                key: p.type,
                cells: [t(`orderType.${p.type}`), p.orders, m(p.net)],
              }))}
            />
            <Breakdown
              title={t('sales.byCashier')}
              headers={[t('cols.cashier'), t('cols.orders'), t('cols.discounts'), t('cols.net')]}
              rows={r.byCashier.map((p) => ({
                key: p.name,
                cells: [p.name, p.orders, m(p.discounts), m(p.net)],
              }))}
            />
            <Card>
              <CardHeader>
                <CardTitle>{t('sales.byHour')}</CardTitle>
              </CardHeader>
              <CardContent>
                <BarChart
                  caption={t('sales.byHour')}
                  emptyLabel={t('empty')}
                  height="h-36"
                  data={r.byHour.map((h) => ({
                    key: String(h.hour),
                    label: String(h.hour).padStart(2, '0'),
                    title: `${String(h.hour).padStart(2, '0')}:00`,
                    value: h.net.amount,
                    display: `${m(h.net)} · ${t('sales.ordersCount', { count: h.orders })}`,
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid items-start gap-section lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('sales.breakdown')}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                  {(
                    [
                      ['gross', r.totals.gross, ''],
                      ['discounts', r.totals.discounts, '−'],
                      ['charges', r.totals.charges, '+'],
                      ['tax', r.totals.tax, '+'],
                      ['salesTotal', r.totals.sales, '='],
                      ['refunds', r.totals.refunds, '−'],
                    ] as const
                  ).map(([k, v, sign]) => (
                    <div key={k} className="contents">
                      <dt className="text-muted-foreground">{t(`sales.${k}`)}</dt>
                      <dd className="text-right tabular">
                        {sign} {m(v)}
                      </dd>
                    </div>
                  ))}
                  <dt className="border-t pt-1 font-semibold">{t('sales.net')}</dt>
                  <dd className="border-t pt-1 text-right font-semibold tabular">
                    {m(r.totals.net)}
                  </dd>
                </dl>
                <p className="mt-3 text-xs text-muted-foreground">{t('sales.taxNote')}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('sales.channels')}</CardTitle>
                <CardDescription>{t('sales.channelsHint')}</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
                  <dt>{t('sales.wholesale', { count: r.channels.wholesale.invoices })}</dt>
                  <dd className="text-right tabular">{m(r.channels.wholesale.total)}</dd>
                  <dt className="text-muted-foreground">{t('sales.wholesaleCredit')}</dt>
                  <dd className="text-right text-muted-foreground tabular">
                    {m(r.channels.wholesale.credit)}
                  </dd>
                  <dt className="text-muted-foreground">{t('sales.wholesaleReturns')}</dt>
                  <dd className="text-right text-muted-foreground tabular">
                    {m(r.channels.wholesale.returns)}
                  </dd>
                  <dt className="border-t pt-1">
                    {t('sales.staffMeals', { count: r.channels.staffMeals.meals })}
                  </dt>
                  <dd className="border-t pt-1 text-right tabular">
                    {m(r.channels.staffMeals.value)}
                  </dd>
                </dl>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </ReportShell>
  );
}
