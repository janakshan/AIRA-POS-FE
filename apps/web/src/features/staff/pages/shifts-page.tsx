import { isApiError } from '@rbp/api-client';
import type { CashShift, Money } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterChip,
  Input,
  MoneyInput,
  MoneyText,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@rbp/ui';
import { formatDateTime, formatMoney } from '@rbp/utils';
import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon, LockIcon, UnlockIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { useMe } from '@/features/auth/api/queries';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useAssignShift,
  useCashShiftEvent,
  useCashShifts,
  useCloseCashShift,
  useCurrentCashShift,
  useOpenCashShift,
  useRoster,
} from '../api/queries';
import { dayLabel, localDay } from '../lib/dates';

const OFF = 'off';

/**
 * HR-004 Shifts (§24, §30, SCN-005): the work roster by week, and the cash-drawer shift on this
 * device — open with a float, cash in/out, count and close; the next person opens with the count.
 */
export function ShiftsPage() {
  const { t } = useTranslation('staff');
  const { can } = useAccess();
  const list = useListParams({ filterKeys: ['tab', 'location', 'week'] });
  const tab = list.filters.tab === 'drawer' ? 'drawer' : 'roster';
  return (
    <Screen id="HR-004" title={t('shifts.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('shifts.title')}
        description={t('shifts.hint')}
      />
      <Tabs value={tab} onValueChange={(v) => list.setFilter('tab', v === 'roster' ? null : v)}>
        <TabsList>
          <TabsTrigger value="roster">{t('shifts.roster')}</TabsTrigger>
          {can('pos.drawer.open') && <TabsTrigger value="drawer">{t('shifts.drawer')}</TabsTrigger>}
        </TabsList>
        <TabsContent value="roster" className="space-y-section">
          <RosterTab list={list} />
        </TabsContent>
        {can('pos.drawer.open') && (
          <TabsContent value="drawer" className="space-y-section">
            <DrawerTab />
          </TabsContent>
        )}
      </Tabs>
    </Screen>
  );
}

function RosterTab({ list }: { list: ReturnType<typeof useListParams> }) {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const { can } = useAccess();
  const { current } = useMyLocations();
  const locationId = list.filters.location ?? current?.id ?? '';
  const week = list.filters.week ?? localDay();
  const roster = useRoster(locationId, week);
  const assign = useAssignShift();
  const editable = can('staff.manage');
  const r = roster.data;

  const move = (days: number) => {
    const [y, m, d] = (r?.weekStart ?? week).split('-').map(Number);
    list.setFilter('week', localDay(days, new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)));
  };

  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <LocationSelect
          value={locationId}
          onChange={(v) => list.setFilter('location', v === current?.id ? null : v)}
          label={t('fields.location')}
        />
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => move(-7)}
            aria-label={t('shifts.prevWeek')}
          >
            <ChevronLeftIcon />
          </Button>
          <span className="min-w-40 text-center text-sm font-medium">
            {r ? t('shifts.weekOf', { date: dayLabel(r.weekStart, locale) }) : ''}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => move(7)}
            aria-label={t('shifts.nextWeek')}
          >
            <ChevronRightIcon />
          </Button>
        </div>
      </div>
      {roster.isError ? (
        <QueryError error={roster.error} onRetry={() => roster.refetch()} />
      ) : !r ? (
        <Skeleton className="h-64" />
      ) : !r.employees.length ? (
        <EmptyState icon={HistoryIcon} title={t('shifts.noStaff')} />
      ) : (
        <Card className="overflow-x-auto p-0" tabIndex={0} aria-label={t('shifts.roster')}>
          <table className="w-full min-w-[56rem] text-sm">
            <caption className="sr-only">{t('shifts.roster')}</caption>
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th scope="col" className="px-3 py-2 font-medium">
                  {t('fields.name')}
                </th>
                {r.days.map((d) => (
                  <th key={d} scope="col" className="px-1 py-2 font-medium">
                    {dayLabel(d, locale)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.employees.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    {e.fullName}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {e.jobTitle}
                    </span>
                  </th>
                  {r.days.map((d) => {
                    const a = r.assignments.find((x) => x.employeeId === e.id && x.date === d);
                    const name = r.templates.find((x) => x.id === a?.templateId)?.name;
                    return (
                      <td key={d} className="px-1 py-1.5">
                        {editable ? (
                          <Select
                            value={a?.templateId ?? OFF}
                            onValueChange={(v) =>
                              assign.mutate(
                                {
                                  locationId,
                                  employeeId: e.id,
                                  date: d,
                                  templateId: v === OFF ? null : v,
                                },
                                { onError: (err) => toast.error(errorMessage(err)) },
                              )
                            }
                          >
                            <SelectTrigger
                              className="h-9 w-full min-w-24 px-2 text-xs"
                              aria-label={t('shifts.cell', {
                                name: e.fullName,
                                day: dayLabel(d, locale),
                              })}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={OFF}>{t('shifts.off')}</SelectItem>
                              {r.templates.map((tpl) => (
                                <SelectItem key={tpl.id} value={tpl.id}>
                                  {tpl.name} {tpl.start}–{tpl.end}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs">{name ?? t('shifts.off')}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function DrawerTab() {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const { data: me } = useMe();
  const device = me?.device ?? null;
  const locationId = me?.currentLocation?.id ?? '';
  const current = useCurrentCashShift(device?.id);
  const history = useCashShifts(locationId);
  const lastClosed = history.data?.find((s) => s.status === 'CLOSED');

  const columns: DataTableColumn<CashShift>[] = [
    {
      id: 'number',
      header: t('fields.shift'),
      primary: true,
      width: 'w-36',
      cell: (s) => (
        <span>
          <span className="font-semibold">{s.number}</span>
          <span className="block text-xs text-muted-foreground">{s.deviceName}</span>
        </span>
      ),
    },
    {
      id: 'who',
      header: t('drawer.openedBy'),
      cell: (s) => (
        <span className="text-sm">
          {s.openedBy.name} · {formatDateTime(s.openedAt, { locale })}
          {s.closedBy && (
            <span className="block text-xs text-muted-foreground">
              {t('drawer.closedByAt', {
                name: s.closedBy.name,
                at: s.closedAt ? formatDateTime(s.closedAt, { locale }) : '',
              })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: 'expected',
      header: t('drawer.expected'),
      align: 'right',
      width: 'w-32',
      cell: (s) => <MoneyText value={s.expectedCash} locale={locale} />,
    },
    {
      id: 'counted',
      header: t('drawer.counted'),
      align: 'right',
      width: 'w-32',
      cell: (s) =>
        s.countedCash ? (
          <MoneyText value={s.countedCash} locale={locale} />
        ) : (
          <StatusBadge tone="success" size="sm">
            {t('drawer.open')}
          </StatusBadge>
        ),
    },
    {
      id: 'variance',
      header: t('drawer.variance'),
      align: 'right',
      width: 'w-28',
      cell: (s) =>
        s.variance ? (
          <MoneyText
            value={s.variance}
            locale={locale}
            className={s.variance.amount ? 'font-semibold' : 'text-muted-foreground'}
          />
        ) : (
          '—'
        ),
    },
  ];

  return (
    <>
      {!device ? (
        <Alert tone="info" title={t('drawer.noDevice')} />
      ) : current.isError ? (
        <QueryError error={current.error} onRetry={() => current.refetch()} />
      ) : current.isPending ? (
        <Skeleton className="h-48" />
      ) : current.data ? (
        <OpenShift shift={current.data} />
      ) : (
        <OpenForm
          key={lastClosed?.id ?? 'none'}
          deviceName={device.name}
          suggested={lastClosed?.countedCash ?? null}
          handover={lastClosed ?? null}
        />
      )}
      <section className="space-y-3" aria-labelledby="shift-history">
        <h2 id="shift-history" className="text-lg font-semibold">
          {t('drawer.history')}
        </h2>
        <Card className="p-0">
          <DataTable
            caption={t('drawer.history')}
            columns={columns}
            rows={history.data}
            getRowId={(s) => s.id}
            getRowLabel={(s) => s.number}
            loading={history.isPending}
            empty={<EmptyState icon={HistoryIcon} title={t('drawer.noHistory')} />}
          />
        </Card>
      </section>
    </>
  );
}

function PinField({
  id,
  value,
  onChange,
  label,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      />
    </div>
  );
}

function OpenForm({
  deviceName,
  suggested,
  handover,
}: {
  deviceName: string;
  suggested: Money | null;
  handover: CashShift | null;
}) {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const open = useOpenCashShift();
  const ids = { pin: useId(), float: useId() };
  const [pin, setPin] = useState('');
  const [float, setFloat] = useState<Money | null>(suggested);
  const submit = () =>
    open.mutate(
      { pin, openingFloat: float?.amount ?? 0 },
      {
        onSuccess: (s) => {
          toast.success(t('drawer.opened', { number: s.number, name: s.openedBy.name }));
          setPin('');
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UnlockIcon className="size-5" aria-hidden />{' '}
          {t('drawer.openTitle', { device: deviceName })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {handover?.countedCash && (
          <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
            {t('drawer.handover', {
              name: handover.closedBy?.name ?? '',
              amount: formatMoney(handover.countedCash, locale),
            })}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={ids.float} className="text-sm font-medium">
              {t('drawer.float')}
            </label>
            <MoneyInput
              id={ids.float}
              value={float}
              onChange={setFloat}
              currency="LKR"
              symbol="Rs"
            />
          </div>
          <PinField id={ids.pin} value={pin} onChange={setPin} label={t('drawer.yourPin')} />
        </div>
        <Button size="pos" disabled={pin.length !== 4} loading={open.isPending} onClick={submit}>
          <UnlockIcon /> {t('drawer.openAction')}
        </Button>
      </CardContent>
    </Card>
  );
}

function OpenShift({ shift }: { shift: CashShift }) {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const event = useCashShiftEvent();
  const close = useCloseCashShift();
  const ids = { amount: useId(), note: useId(), pin: useId(), counted: useId() };
  const [type, setType] = useState<'CASH_IN' | 'CASH_OUT'>('CASH_OUT');
  const [amount, setAmount] = useState<Money | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [counted, setCounted] = useState<Money | null>(null);
  const m = (v: Money) => formatMoney(v, locale);
  const variance = counted ? counted.amount - shift.expectedCash.amount : null;

  const addEvent = () =>
    event.mutate(
      { id: shift.id, body: { type, amount: amount?.amount ?? 0, note } },
      {
        onSuccess: () => {
          setAmount(null);
          setNote('');
        },
        onError: (e) => {
          const fe = isApiError(e) ? e.details?.fieldErrors : undefined;
          const key = fe && typeof fe === 'object' ? (fe as Record<string, string>).amount : null;
          if (key) setAmountError(key);
          else toast.error(errorMessage(e));
        },
      },
    );
  const doClose = () =>
    close.mutate(
      { id: shift.id, body: { pin, countedCash: counted?.amount ?? 0 } },
      {
        onSuccess: (s) =>
          toast.success(
            t('drawer.closed', {
              number: s.number,
              variance: s.variance ? m(s.variance) : '',
            }),
          ),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div className="grid items-start gap-section lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {shift.number}
            <StatusBadge tone="success" size="sm">
              {t('drawer.open')}
            </StatusBadge>
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('drawer.openedByAt', {
              name: shift.openedBy.name,
              at: formatDateTime(shift.openedAt, { locale }),
              device: shift.deviceName,
            })}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
            <dt>{t('drawer.float')}</dt>
            <dd className="text-right tabular">{m(shift.openingFloat)}</dd>
            <dt>{t('drawer.cashSales')}</dt>
            <dd className="text-right tabular">+ {m(shift.cashSales)}</dd>
            <dt>{t('drawer.cashRefunds')}</dt>
            <dd className="text-right tabular">− {m(shift.cashRefunds)}</dd>
            {shift.events.map((e) => (
              <div key={e.id} className="contents">
                <dt className="text-muted-foreground">
                  {t(`drawer.${e.type}`)} · {e.note}
                </dt>
                <dd className="text-right text-muted-foreground tabular">
                  {e.type === 'CASH_IN' ? '+' : '−'} {m(e.amount)}
                </dd>
              </div>
            ))}
            <dt className="border-t pt-1 font-semibold">{t('drawer.expected')}</dt>
            <dd className="border-t pt-1 text-right font-semibold tabular">
              {m(shift.expectedCash)}
            </dd>
          </dl>
          <div className="space-y-2 border-t pt-3">
            <div className="flex gap-2">
              {(['CASH_OUT', 'CASH_IN'] as const).map((x) => (
                <FilterChip
                  key={x}
                  active={type === x}
                  onClick={() => {
                    setType(x);
                    setAmountError(null);
                  }}
                >
                  {t(`drawer.${x}`)}
                </FilterChip>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-1.5">
                <label htmlFor={ids.amount} className="text-sm font-medium">
                  {t('drawer.amount')}
                </label>
                <MoneyInput
                  id={ids.amount}
                  value={amount}
                  onChange={(v) => {
                    setAmount(v);
                    setAmountError(null);
                  }}
                  currency="LKR"
                  symbol="Rs"
                  aria-invalid={!!amountError}
                  aria-describedby={amountError ? `${ids.amount}-error` : undefined}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={ids.note} className="text-sm font-medium">
                  {t('drawer.note')}
                </label>
                <Input
                  id={ids.note}
                  value={note}
                  maxLength={120}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                disabled={!amount?.amount || note.trim().length < 3}
                loading={event.isPending}
                onClick={addEvent}
              >
                {t('drawer.record')}
              </Button>
            </div>
            {amountError && (
              <p id={`${ids.amount}-error`} role="alert" className="text-sm text-destructive">
                {t(`common:${amountError}`)}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockIcon className="size-5" aria-hidden /> {t('drawer.closeTitle')}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t('drawer.closeHint')}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor={ids.counted} className="text-sm font-medium">
                {t('drawer.counted')}
              </label>
              <MoneyInput
                id={ids.counted}
                value={counted}
                onChange={setCounted}
                currency="LKR"
                symbol="Rs"
              />
            </div>
            <PinField id={ids.pin} value={pin} onChange={setPin} label={t('drawer.yourPin')} />
          </div>
          {variance !== null && (
            <p
              aria-live="polite"
              className={
                variance
                  ? 'text-sm font-semibold text-status-warning-fg'
                  : 'text-sm text-status-success-fg'
              }
            >
              {variance === 0
                ? t('drawer.balanced')
                : t(variance < 0 ? 'drawer.short' : 'drawer.over', {
                    amount: m({
                      amount: Math.abs(variance),
                      currency: shift.expectedCash.currency,
                    }),
                  })}
            </p>
          )}
          <Button
            size="pos"
            disabled={!counted || pin.length !== 4}
            loading={close.isPending}
            onClick={doClose}
          >
            <LockIcon /> {t('drawer.closeAction')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
