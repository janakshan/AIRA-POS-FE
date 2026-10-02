import type { Money, VoidsReport } from '@rbp/types';
import {
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  MoneyText,
  Skeleton,
  StatCard,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@rbp/ui';
import { formatDateTime, formatMoney } from '@rbp/utils';
import { BanIcon, PercentIcon, SearchCheckIcon, Undo2Icon, XCircleIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useListParams } from '@/lib/use-list-params';
import { useVoidsReport } from '../api/queries';
import { Breakdown } from '../components/breakdown';
import { ReportShell } from '../components/report-shell';
import { type CsvColumn, csvMoney, downloadCsv, toCsv } from '../lib/csv';
import { fileStem, useReportParams } from '../lib/period';

type Row = {
  id: string;
  kind: string;
  what: string;
  at: string;
  amount: Money | null;
  approvedBy: string;
  reason: string;
  cashier: string;
  locationId: string | null;
};

const TABS = ['discounts', 'cancelled', 'voided', 'removed', 'refunds'] as const;
type Tab = (typeof TABS)[number];

/** Every exception in one shape (for the tables and the CSV). */
function rowsOf(r: VoidsReport): Record<Tab, Row[]> {
  return {
    discounts: r.discounts.map((d) => ({
      id: d.id,
      kind: d.kind,
      what: `${d.orderNumber} · ${d.label}`,
      at: d.at,
      amount: d.amount,
      approvedBy: d.approvedBy,
      reason: d.reason,
      cashier: d.cashier,
      locationId: d.locationId,
    })),
    cancelled: r.cancelled.map((d) => ({
      id: d.orderId,
      kind: 'CANCELLED',
      what: d.orderNumber,
      at: d.at,
      amount: d.amount,
      approvedBy: d.approvedBy,
      reason: d.reason,
      cashier: d.cashier,
      locationId: d.locationId,
    })),
    voided: r.voided.map((d) => ({
      id: d.orderId,
      kind: 'VOIDED',
      what: d.orderNumber,
      at: d.at,
      amount: d.amount,
      approvedBy: d.approvedBy,
      reason: d.reason,
      cashier: d.cashier,
      locationId: d.locationId,
    })),
    removed: r.removedItems.map((d) => ({
      id: d.id,
      kind: 'REMOVED',
      what: d.label,
      at: d.at,
      amount: null,
      approvedBy: d.approvedBy,
      reason: d.reason,
      cashier: d.cashier,
      locationId: d.locationId,
    })),
    refunds: r.refunds.map((d) => ({
      id: d.id,
      kind: 'REFUND',
      what: `${d.number} · ${d.orderNumber} · ${d.items}`,
      at: d.at,
      amount: d.amount,
      approvedBy: d.approvedBy,
      reason: d.reason,
      cashier: d.cashier,
      locationId: d.locationId,
    })),
  };
}

/**
 * REP-005 Void / discount report: every discount, price change, removed item, cancelled
 * order, voided invoice and refund in the period — with the approving PIN and the reason.
 */
export function VoidsReportPage() {
  const { t, i18n } = useTranslation('reports');
  const locale = localeFor(i18n.language);
  const { nameOf } = useMyLocations();
  const rp = useReportParams();
  const tabs = useListParams({ filterKeys: ['tab'] });
  const tab: Tab = TABS.find((x) => x === tabs.filters.tab) ?? 'discounts';
  const report = useVoidsReport(rp.params);
  const r = report.data;
  const rows = r ? rowsOf(r) : null;

  const columns: DataTableColumn<Row>[] = [
    {
      id: 'what',
      header: t('cols.what'),
      primary: true,
      cell: (x) => (
        <span>
          <span className="font-medium">{x.what}</span>
          <span className="block text-xs text-muted-foreground">
            {formatDateTime(x.at, { locale })}
            {x.locationId ? ` · ${nameOf(x.locationId)}` : ''}
          </span>
        </span>
      ),
    },
    {
      id: 'reason',
      header: t('cols.reason'),
      cell: (x) => (
        <span className="text-sm">
          {x.kind === 'PRICE' && (
            <StatusBadge tone="info" size="sm" className="mr-1">
              {t('voids.price')}
            </StatusBadge>
          )}
          {x.reason}
        </span>
      ),
    },
    {
      id: 'approved',
      header: t('cols.approvedBy'),
      width: 'w-40',
      cell: (x) => (
        <span className="text-sm">
          {x.approvedBy}
          <span className="block text-xs text-muted-foreground">
            {t('voids.by', { name: x.cashier })}
          </span>
        </span>
      ),
    },
    {
      id: 'amount',
      header: t('cols.amount'),
      align: 'right',
      width: 'w-32',
      cell: (x) =>
        x.amount ? <MoneyText value={x.amount} locale={locale} className="font-semibold" /> : '—',
    },
  ];

  const csv = () => {
    if (!r || !rows) return;
    const cols: CsvColumn<Row & { section: string }>[] = [
      { header: 'Section', value: (x) => x.section },
      // Local date/time as on screen, not the stored UTC ISO (A-288: local dates).
      { header: 'Date', value: (x) => formatDateTime(x.at, { locale }) },
      { header: 'Location', value: (x) => (x.locationId ? nameOf(x.locationId) : '') },
      { header: 'What', value: (x) => x.what },
      { header: 'Reason', value: (x) => x.reason },
      { header: 'Approved by', value: (x) => x.approvedBy },
      { header: 'Cashier', value: (x) => x.cashier },
      { header: 'Amount', value: (x) => csvMoney(x.amount) },
    ];
    const all = TABS.flatMap((k) => rows[k].map((x) => ({ ...x, section: t(`voids.tabs.${k}`) })));
    downloadCsv(fileStem('voids-discounts', r.from, r.to), toCsv(all, cols));
  };

  const count = (k: Tab) => rows?.[k].length ?? 0;
  return (
    <ReportShell
      id="REP-005"
      title={t('voids.title')}
      description={t('voids.hint')}
      rp={rp}
      onCsv={csv}
      csvDisabled={!r}
    >
      {report.isError ? (
        <QueryError error={report.error} onRetry={() => report.refetch()} />
      ) : !r || !rows ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            <StatCard
              label={t('voids.discounts')}
              icon={PercentIcon}
              value={<MoneyText value={r.totals.discounts} locale={locale} />}
              hint={t('voids.count', { count: count('discounts') })}
            />
            <StatCard
              label={t('voids.cancelled')}
              icon={XCircleIcon}
              value={<MoneyText value={r.totals.cancelled} locale={locale} />}
              hint={t('voids.count', { count: count('cancelled') })}
            />
            <StatCard
              label={t('voids.voided')}
              icon={BanIcon}
              value={<MoneyText value={r.totals.voided} locale={locale} />}
              hint={t('voids.count', { count: count('voided') })}
            />
            <StatCard
              label={t('voids.refunds')}
              icon={Undo2Icon}
              value={<MoneyText value={r.totals.refunds} locale={locale} />}
              hint={t('voids.count', { count: count('refunds') })}
            />
            <StatCard
              label={t('voids.removed')}
              icon={SearchCheckIcon}
              value={r.totals.removedItems}
              hint={t('voids.removedHint')}
            />
          </div>
          <Tabs
            value={tab}
            onValueChange={(v) => tabs.setFilter('tab', v === 'discounts' ? null : v)}
          >
            <TabsList className="flex-wrap">
              {TABS.map((k) => (
                <TabsTrigger key={k} value={k}>
                  {t(`voids.tabs.${k}`)} ({count(k)})
                </TabsTrigger>
              ))}
            </TabsList>
            {TABS.map((k) => (
              <TabsContent key={k} value={k}>
                <Card className="p-0">
                  <DataTable
                    caption={t(`voids.tabs.${k}`)}
                    columns={columns}
                    rows={rows[k]}
                    getRowId={(x) => x.id}
                    getRowLabel={(x) => x.what}
                    loading={false}
                    empty={<EmptyState icon={SearchCheckIcon} title={t('voids.none')} />}
                  />
                </Card>
              </TabsContent>
            ))}
          </Tabs>
          <div className="grid items-start gap-section lg:grid-cols-2">
            <Breakdown
              title={t('voids.byReason')}
              headers={[t('cols.reason'), t('cols.count'), t('cols.amount')]}
              rows={r.byReason.map((x) => ({
                key: x.reason,
                cells: [x.reason, x.count, formatMoney(x.amount, locale)],
              }))}
            />
            <Breakdown
              title={t('voids.byApprover')}
              headers={[t('cols.approvedBy'), t('cols.count'), t('cols.amount')]}
              rows={r.byApprover.map((x) => ({
                key: x.name,
                cells: [x.name, x.count, formatMoney(x.amount, locale)],
              }))}
            />
          </div>
        </>
      )}
    </ReportShell>
  );
}
