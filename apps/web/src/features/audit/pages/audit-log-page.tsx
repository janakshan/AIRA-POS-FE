import type { AuditEvent, AuditListParams } from '@rbp/types';
import {
  Button,
  Card,
  Input,
  toast,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  FilterChip,
  PageHeader,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  StatusBadge,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { DownloadIcon, PrinterIcon, SearchXIcon, ShieldCheckIcon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { downloadCsv, toCsv } from '@/features/reports/lib/csv';
import { api } from '@/lib/api';
import { DATE_RANGES, rangeBounds } from '@/lib/date-range';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useAuditEvents, useEmployees } from '../api/queries';
import { AuditDiff } from '../components/audit-diff';
import { AUDIT_GROUPS, auditActionLabel } from '../lib/action-labels';

const PAGE_SIZE = 25;

const localDayStamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** REP-006 Audit log (INS-212…229): read-only history of important changes. */
export function AuditLogPage() {
  const { t, i18n } = useTranslation('audit');
  const locale = localeFor(i18n.language);
  const list = useListParams({
    pageSize: PAGE_SIZE,
    filterKeys: ['group', 'sensitive', 'employee', 'range', 'from', 'to', 'location'],
  });
  const employees = useEmployees();
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const group = AUDIT_GROUPS.find((g) => g.key === list.filters.group) ?? AUDIT_GROUPS[0];
  const range = DATE_RANGES.find((r) => r === list.filters.range) ?? 'all';
  const bounds = useMemo(
    () => rangeBounds(range, list.filters.from, list.filters.to),
    [range, list.filters.from, list.filters.to],
  );
  const ids = { from: useId(), to: useId() };
  const errorMessage = useErrorMessage();
  const [exporting, setExporting] = useState(false);
  const filters: AuditListParams = {
    ...(group.prefix ? { actionPrefix: group.prefix } : {}),
    ...(list.filters.sensitive ? { sensitive: true } : {}),
    ...(list.filters.employee ? { employeeId: list.filters.employee } : {}),
    ...(list.filters.location ? { locationId: list.filters.location } : {}),
    ...bounds,
    ...(list.search ? { search: list.search } : {}),
  };
  const events = useAuditEvents({ page: list.page, pageSize: PAGE_SIZE, ...filters });

  /** Every matching event (up to 2,000) as a CSV file. */
  const exportCsv = async () => {
    setExporting(true);
    try {
      const all: AuditEvent[] = [];
      for (let page = 1; page <= 20; page++) {
        const r = await api.audit.list({ ...filters, page, pageSize: 100 });
        all.push(...r.items);
        if (page * r.pageSize >= r.total) break;
      }
      downloadCsv(
        `audit-${localDayStamp()}`,
        toCsv(all, [
          { header: 'When', value: (e) => e.at },
          { header: 'Action', value: (e) => auditActionLabel(t, e.action) },
          { header: 'Code', value: (e) => e.action },
          { header: 'What', value: (e) => e.entityLabel ?? e.entityId },
          { header: 'User', value: (e) => e.userName },
          { header: 'Approved by (PIN)', value: (e) => e.employee?.fullName ?? '' },
          { header: 'Reason', value: (e) => e.reason?.label ?? '' },
          { header: 'Comment', value: (e) => e.reason?.comment ?? '' },
          { header: 'Location', value: (e) => e.locationName ?? '' },
          { header: 'Device', value: (e) => e.deviceName ?? '' },
        ]),
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const columns: DataTableColumn<AuditEvent>[] = [
    {
      id: 'when',
      header: t('columns.when'),
      width: 'w-40',
      cell: (e) => <span className="text-sm tabular">{formatDateTime(e.at, { locale })}</span>,
    },
    {
      id: 'action',
      header: t('columns.action'),
      primary: true,
      cell: (e) => (
        <span className="flex flex-col">
          <span className="flex items-center gap-1.5 font-medium">
            {e.employee && (
              <ShieldCheckIcon
                className="size-4 text-status-success"
                aria-label={t('sensitiveOnly')}
              />
            )}
            {auditActionLabel(t, e.action)}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">{e.action}</span>
        </span>
      ),
    },
    {
      id: 'what',
      header: t('columns.what'),
      cell: (e) => <span className="text-sm">{e.entityLabel ?? e.entityId}</span>,
    },
    { id: 'by', header: t('columns.by'), width: 'w-36', cell: (e) => e.userName },
    {
      id: 'approvedBy',
      header: t('columns.approvedBy'),
      width: 'w-36',
      cell: (e) => e.employee?.fullName ?? <span aria-hidden>{t('none')}</span>,
    },
    {
      id: 'reason',
      header: t('columns.reason'),
      hideOnTablet: true,
      cell: (e) =>
        e.reason ? (
          <span className="text-sm">
            {e.reason.label}
            {e.reason.comment && (
              <span className="block text-xs text-muted-foreground">“{e.reason.comment}”</span>
            )}
          </span>
        ) : (
          <span aria-hidden>{t('none')}</span>
        ),
    },
  ];

  return (
    <Screen id="REP-006" title={t('title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('title')}
        description={t('hint')}
        actions={
          <>
            <Button variant="outline" loading={exporting} onClick={() => void exportCsv()}>
              <DownloadIcon /> {t('reports:shell.csv')}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (!navigator.userAgent.includes('jsdom')) window.print();
              }}
            >
              <PrinterIcon /> {t('reports:shell.print')}
            </Button>
          </>
        }
      />
      {range === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 print:hidden">
          <div className="space-y-1.5">
            <label htmlFor={ids.from} className="text-sm font-medium">
              {t('reports:shell.from')}
            </label>
            <Input
              id={ids.from}
              type="date"
              value={list.filters.from ?? ''}
              className="w-full sm:w-44"
              onChange={(e) => list.setFilter('from', e.target.value || null)}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.to} className="text-sm font-medium">
              {t('reports:shell.to')}
            </label>
            <Input
              id={ids.to}
              type="date"
              value={list.filters.to ?? ''}
              className="w-full sm:w-44"
              onChange={(e) => list.setFilter('to', e.target.value || null)}
            />
          </div>
        </div>
      )}
      <Card className="p-0" data-print-root="report">
        <DataTable
          caption={t('caption')}
          columns={columns}
          rows={events.data?.items}
          getRowId={(e) => e.id}
          getRowLabel={(e) => `${auditActionLabel(t, e.action)} · ${e.entityLabel ?? ''}`}
          loading={events.isPending}
          onRowClick={setOpen}
          error={
            events.isError ? (
              <QueryError error={events.error} onRetry={() => events.refetch()} />
            ) : undefined
          }
          empty={
            <EmptyState icon={SearchXIcon} title={t('emptyTitle')} description={t('emptyHint')} />
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('search')}
                  aria-label={t('search')}
                />
              }
              filters={
                <>
                  {AUDIT_GROUPS.map((g) => (
                    <FilterChip
                      key={g.key}
                      active={group.key === g.key}
                      onClick={() => list.setFilter('group', g.key === 'all' ? null : g.key)}
                    >
                      {t(`groups.${g.key}`)}
                    </FilterChip>
                  ))}
                  <FilterChip
                    active={!!list.filters.sensitive}
                    aria-pressed={!!list.filters.sensitive}
                    onClick={() => list.setFilter('sensitive', list.filters.sensitive ? null : '1')}
                  >
                    <ShieldCheckIcon className="size-4" aria-hidden /> {t('sensitiveOnly')}
                  </FilterChip>
                  <Select
                    value={list.filters.employee ?? 'any'}
                    onValueChange={(v) => list.setFilter('employee', v === 'any' ? null : v)}
                  >
                    <SelectTrigger className="w-full sm:w-48" aria-label={t('columns.approvedBy')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t('anyEmployee')}</SelectItem>
                      {employees.data?.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <LocationSelect
                    value={list.filters.location ?? 'all'}
                    onChange={(v) => list.setFilter('location', v === 'all' ? null : v)}
                    allowAll
                    label={t('reports:shell.location')}
                    className="w-full sm:w-48"
                  />
                  <Select
                    value={range}
                    onValueChange={(v) => list.setFilter('range', v === 'all' ? null : v)}
                  >
                    <SelectTrigger className="w-full sm:w-40" aria-label={t('columns.when')}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_RANGES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`range.${r}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              }
            />
          }
          footer={
            events.data && events.data.total > 0 ? (
              <Pagination
                page={list.page}
                pageSize={PAGE_SIZE}
                total={events.data.total}
                onPageChange={list.setPage}
                summary={(a, b, total) => t('catalog:common.summary', { from: a, to: b, total })}
                previousLabel={t('catalog:common.previous')}
                nextLabel={t('catalog:common.next')}
                pageLabel={(p) => t('catalog:common.page', { page: p })}
              />
            ) : undefined
          }
        />
      </Card>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent
          closeLabel={t('common:actions.close')}
          className="w-full overflow-y-auto sm:max-w-lg"
        >
          {open && (
            <>
              <SheetHeader>
                <SheetTitle>{auditActionLabel(t, open.action)}</SheetTitle>
                <SheetDescription>{open.entityLabel}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6">
                <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{t('columns.when')}</dt>
                  <dd className="tabular">{formatDateTime(open.at, { locale })}</dd>
                  <dt className="text-muted-foreground">{t('columns.by')}</dt>
                  <dd>{open.userName}</dd>
                  <dt className="text-muted-foreground">{t('columns.approvedBy')}</dt>
                  <dd className="flex items-center gap-1.5">
                    {open.employee ? (
                      <>
                        <ShieldCheckIcon className="size-4 text-status-success" aria-hidden />
                        {open.employee.fullName}
                        <span className="font-mono text-xs text-muted-foreground">
                          {open.employee.code}
                        </span>
                      </>
                    ) : (
                      t('none')
                    )}
                  </dd>
                  {open.permission && (
                    <>
                      <dt className="text-muted-foreground">{t('detail.permission')}</dt>
                      <dd>
                        <StatusBadge tone="neutral" size="sm" hideIcon>
                          {open.permission}
                        </StatusBadge>
                      </dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">{t('columns.reason')}</dt>
                  <dd>{open.reason?.label ?? t('none')}</dd>
                  {open.reason?.comment && (
                    <>
                      <dt className="text-muted-foreground">{t('detail.comment')}</dt>
                      <dd>“{open.reason.comment}”</dd>
                    </>
                  )}
                  <dt className="text-muted-foreground">{t('columns.where')}</dt>
                  <dd>
                    {[open.locationName, open.deviceName].filter(Boolean).join(' · ') || t('none')}
                  </dd>
                  <dt className="text-muted-foreground">{t('detail.eventId')}</dt>
                  <dd className="font-mono text-xs">{open.id}</dd>
                </dl>
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">{t('detail.title')}</h3>
                  <AuditDiff before={open.before} after={open.after} />
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </Screen>
  );
}
