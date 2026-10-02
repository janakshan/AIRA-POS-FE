import { isApiError } from '@rbp/api-client';
import type { AttendanceRow, AttendanceStatus } from '@rbp/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Input,
  PageHeader,
  PinKeypad,
  StatCard,
  StatusBadge,
  type StatusTone,
} from '@rbp/ui';
import { formatDateTime } from '@rbp/utils';
import { AlarmClockIcon, LogInIcon, UserCheckIcon, UserXIcon, UsersRoundIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { useAccess } from '@/features/auth/hooks/use-access';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useAttendanceDay, useClock } from '../api/queries';
import { hoursMinutes, localDay } from '../lib/dates';

const TONE: Record<AttendanceStatus, StatusTone> = {
  ON_TIME: 'success',
  LATE: 'warning',
  ABSENT: 'danger',
  UPCOMING: 'info',
  UNROSTERED: 'neutral',
  OFF: 'neutral',
};

/**
 * HR-003 Attendance (§24): staff clock in and out with their PIN on this device; the day sheet
 * compares clock-ins with the roster (late, absent).
 */
export function AttendancePage() {
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const { can } = useAccess();
  const { current, nameOf } = useMyLocations();
  const list = useListParams({ filterKeys: ['location', 'date'] });
  const dateId = useId();
  const locationId = list.filters.location ?? current?.id ?? '';
  const date = list.filters.date ?? localDay();
  const canView = can('staff.view');
  const day = useAttendanceDay({ locationId, date }, canView);
  const rows = day.data ?? [];

  const columns: DataTableColumn<AttendanceRow>[] = [
    {
      id: 'name',
      header: t('fields.name'),
      primary: true,
      cell: (r) => (
        <span>
          <Link
            to={`/staff/employees/${r.employeeId}`}
            className="inline-flex items-center font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
            onClick={(e) => e.stopPropagation()}
          >
            {r.employeeName}
          </Link>
          <span className="block text-xs text-muted-foreground">{r.jobTitle}</span>
        </span>
      ),
    },
    {
      id: 'shift',
      header: t('fields.shift'),
      width: 'w-36',
      cell: (r) =>
        r.shift ? (
          <span className="text-sm">
            {r.shift.name}
            <span className="block text-xs text-muted-foreground">
              {r.shift.start}–{r.shift.end}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'in',
      header: t('fields.clockIn'),
      width: 'w-44',
      hideOnTablet: true,
      cell: (r) => (r.records[0] ? formatDateTime(r.records[0].clockInAt, { locale }) : '—'),
    },
    {
      id: 'out',
      header: t('fields.clockOut'),
      width: 'w-44',
      hideOnTablet: true,
      cell: (r) => {
        const last = r.records.at(-1);
        return !last
          ? '—'
          : last.clockOutAt
            ? formatDateTime(last.clockOutAt, { locale })
            : t('attendance.inNow');
      },
    },
    {
      id: 'hours',
      header: t('fields.hours'),
      align: 'right',
      width: 'w-24',
      cell: (r) => (r.minutes ? <span className="tabular">{hoursMinutes(r.minutes)}</span> : '—'),
    },
    {
      id: 'status',
      header: t('fields.status'),
      width: 'w-36',
      cell: (r) => (
        <span className="inline-flex flex-wrap gap-1">
          <StatusBadge tone={TONE[r.status]} size="sm">
            {r.status === 'LATE'
              ? t('attendance.lateBy', { count: r.lateBy })
              : t(`attendance.status.${r.status}`)}
          </StatusBadge>
          {r.inNow && (
            <StatusBadge tone="success" size="sm">
              {t('attendance.inNow')}
            </StatusBadge>
          )}
        </span>
      ),
    },
  ];

  const count = (f: (r: AttendanceRow) => boolean) => rows.filter(f).length;

  return (
    <Screen id="HR-003" title={t('attendance.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('attendance.title')}
        description={t('attendance.hint', { location: nameOf(locationId) })}
      />
      <div className="grid items-start gap-section lg:grid-cols-[20rem_minmax(0,1fr)]">
        <ClockPanel locationId={locationId} />
        <div className="space-y-section">
          <div className="flex flex-wrap items-end gap-3">
            <LocationSelect
              value={locationId}
              onChange={(v) => list.setFilter('location', v === current?.id ? null : v)}
              label={t('fields.location')}
            />
            <div className="space-y-1.5">
              <label htmlFor={dateId} className="text-sm font-medium">
                {t('fields.date')}
              </label>
              <Input
                id={dateId}
                type="date"
                value={date}
                className="w-full sm:w-44"
                onChange={(e) => list.setFilter('date', e.target.value || null)}
              />
            </div>
          </div>
          {canView && (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                <StatCard
                  label={t('attendance.inNowCount')}
                  icon={UserCheckIcon}
                  value={count((r) => r.inNow)}
                />
                <StatCard
                  label={t('attendance.lateCount')}
                  icon={AlarmClockIcon}
                  value={count((r) => r.status === 'LATE')}
                />
                <StatCard
                  label={t('attendance.absentCount')}
                  icon={UserXIcon}
                  value={count((r) => r.status === 'ABSENT')}
                />
              </div>
              <Card className="p-0">
                <DataTable
                  caption={t('attendance.sheet')}
                  columns={columns}
                  rows={day.data}
                  getRowId={(r) => r.employeeId}
                  getRowLabel={(r) => r.employeeName}
                  loading={day.isPending}
                  error={
                    day.isError ? (
                      <QueryError error={day.error} onRetry={() => day.refetch()} />
                    ) : undefined
                  }
                  empty={<EmptyState icon={UsersRoundIcon} title={t('attendance.empty')} />}
                />
              </Card>
            </>
          )}
        </div>
      </div>
    </Screen>
  );
}

/** PIN pad on the shared device: the PIN says who; it toggles in / out. */
function ClockPanel({ locationId }: { locationId: string }) {
  const { t } = useTranslation('staff');
  const errorMessage = useErrorMessage();
  const clock = useClock();
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const submit = (value: string) =>
    clock.mutate(
      { pin: value, locationId },
      {
        onSuccess: (r) => {
          setMessage({
            tone: 'ok',
            text:
              r.action === 'IN'
                ? r.lateBy > 10
                  ? t('clock.inLate', { name: r.employee.fullName, count: r.lateBy })
                  : t('clock.in', { name: r.employee.fullName })
                : t('clock.out', {
                    name: r.employee.fullName,
                    time: hoursMinutes(r.record.minutes),
                  }),
          });
          setPin('');
        },
        onError: (e) => {
          const d = isApiError(e) ? e.details : undefined;
          const text =
            isApiError(e) && e.code === 'EMPLOYEE_WRONG_LOCATION' && d?.employeeName
              ? t('clock.wrongLocation', {
                  name: String(d.employeeName),
                  location: String(d.location ?? ''),
                })
              : errorMessage(e);
          setMessage({ tone: 'error', text });
          setPin('');
        },
      },
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LogInIcon className="size-5" aria-hidden /> {t('clock.title')}
        </CardTitle>
        <CardDescription>{t('clock.hint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <PinKeypad
          value={pin}
          onChange={(v) => {
            setPin(v);
            setMessage(null);
          }}
          onComplete={submit}
          disabled={clock.isPending || !locationId}
          error={message?.tone === 'error'}
          clearLabel={t('clock.clear')}
          backspaceLabel={t('clock.back')}
        />
        {message && (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={
              message.tone === 'error'
                ? 'text-center text-sm font-medium text-status-danger-fg'
                : 'text-center text-sm font-medium text-status-success-fg'
            }
          >
            {message.text}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
