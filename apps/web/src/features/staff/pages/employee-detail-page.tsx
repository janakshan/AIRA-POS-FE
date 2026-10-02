import type { AttendanceRecord, StaffMeal } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  MoneyText,
  PageHeader,
  PageSkeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@rbp/ui';
import { formatDateTime, formatPhone } from '@rbp/utils';
import { HistoryIcon, PencilIcon, PhoneIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useAccess } from '@/features/auth/hooks/use-access';
import { EntityHistory } from '@/features/audit/components/entity-history';
import { formatPlainDate } from '@/features/purchasing/lib/status';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useAttendanceHistory, useStaffEmployee, useStaffMeals } from '../api/queries';
import { AllowanceMeter } from '../components/allowance-meter';
import { EmployeeDialog } from '../components/employee-dialog';
import { VoidedMealBadge, VoidMealButton } from '../components/void-meal-button';
import { hoursMinutes, thisMonth } from '../lib/dates';

/** HR-002 Employee: profile, this month's food allowance, attendance and staff meals. */
export function EmployeeDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation('staff');
  const locale = localeFor(i18n.language);
  const { can, hasFeature } = useAccess();
  const employee = useStaffEmployee(id);
  const attendance = useAttendanceHistory(hasFeature('ATTENDANCE') ? id : undefined);
  const meals = useStaffMeals({ employeeId: id ?? '', month: thisMonth() }, !!id);
  const [editing, setEditing] = useState(false);
  useBreadcrumbTitle(employee.data?.fullName);

  if (employee.isError)
    return <QueryError error={employee.error} onRetry={() => employee.refetch()} />;
  if (!employee.data) return <PageSkeleton />;
  const e = employee.data;

  const attendanceColumns: DataTableColumn<AttendanceRecord>[] = [
    {
      id: 'in',
      header: t('fields.clockIn'),
      primary: true,
      cell: (r) => formatDateTime(r.clockInAt, { locale }),
    },
    {
      id: 'out',
      header: t('fields.clockOut'),
      cell: (r) =>
        r.clockOutAt ? (
          formatDateTime(r.clockOutAt, { locale })
        ) : (
          <StatusBadge tone="success" size="sm">
            {t('attendance.inNow')}
          </StatusBadge>
        ),
    },
    {
      id: 'where',
      header: t('fields.location'),
      hideOnTablet: true,
      cell: (r) => r.locationName,
    },
    {
      id: 'hours',
      header: t('fields.hours'),
      align: 'right',
      width: 'w-28',
      cell: (r) => <span className="tabular">{hoursMinutes(r.minutes)}</span>,
    },
  ];

  const mealColumns: DataTableColumn<StaffMeal>[] = [
    {
      id: 'number',
      header: t('fields.meal'),
      primary: true,
      width: 'w-40',
      cell: (m) => (
        <span className="flex flex-wrap items-center gap-2">
          {m.number}
          <VoidedMealBadge meal={m} />
        </span>
      ),
    },
    { id: 'at', header: t('fields.date'), cell: (m) => formatDateTime(m.at, { locale }) },
    {
      id: 'items',
      header: t('fields.items'),
      hideOnTablet: true,
      cell: (m) => m.lines.map((l) => `${l.name} ×${l.quantity}`).join(', '),
    },
    {
      id: 'value',
      header: t('fields.value'),
      align: 'right',
      width: 'w-32',
      cell: (m) => (
        <MoneyText
          value={m.value}
          locale={locale}
          className={m.status === 'VOIDED' ? 'text-muted-foreground line-through' : undefined}
        />
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('voidMeal.action')}</span>,
      align: 'right',
      width: 'w-28',
      cell: (m) => <VoidMealButton meal={m} />,
    },
  ];

  return (
    <Screen id="HR-002" title={e.fullName} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {e.fullName}
            {!e.isActive && (
              <StatusBadge tone="neutral" size="md">
                {t('employees.inactive')}
              </StatusBadge>
            )}
            {e.clockedIn && (
              <StatusBadge tone="success" size="md">
                {t('employees.inAt', { location: e.clockedIn.locationName })}
              </StatusBadge>
            )}
          </span>
        }
        description={`${e.code} · ${e.jobTitle}`}
        actions={
          can('staff.manage') && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <PencilIcon /> {t('employee.edit')}
            </Button>
          )
        }
      />
      <div className="grid items-start gap-section lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="grid gap-4 p-4 sm:grid-cols-2">
          <Fact label={t('fields.phone')}>
            {e.phone ? (
              <a
                href={`tel:${e.phone}`}
                className="inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline pointer-coarse:min-h-11"
              >
                <PhoneIcon className="size-4" aria-hidden /> {formatPhone(e.phone)}
              </a>
            ) : (
              '—'
            )}
          </Fact>
          <Fact label={t('fields.locations')}>{e.locations.map((l) => l.name).join(', ')}</Fact>
          <Fact label={t('employee.login')}>
            {e.login ? `${e.login.email} · ${e.login.roles.join(', ')}` : t('employee.noLogin')}
            {can('settings.manage') && (
              // SET-003 owns sign-ins; the employee record only shows the link.
              <Link
                to={
                  e.login
                    ? `/settings/users?q=${encodeURIComponent(e.login.email)}`
                    : `/settings/users?employee=${encodeURIComponent(e.id)}`
                }
                className="ml-2 text-sm font-normal underline underline-offset-2"
              >
                {t(e.login ? 'employee.manageLogin' : 'employee.createLogin')}
              </Link>
            )}
          </Fact>
          <Fact label={t('employee.joined')}>
            {e.joinedAt ? formatPlainDate(e.joinedAt, locale) : '—'}
          </Fact>
        </Card>
        <AllowanceMeter used={e.mealsThisMonth} allowance={e.monthlyFoodAllowance} />
      </div>

      <Tabs defaultValue={hasFeature('ATTENDANCE') ? 'attendance' : 'meals'}>
        <TabsList>
          {hasFeature('ATTENDANCE') && (
            <TabsTrigger value="attendance">{t('employee.attendance')}</TabsTrigger>
          )}
          <TabsTrigger value="meals">{t('employee.meals')}</TabsTrigger>
        </TabsList>
        {hasFeature('ATTENDANCE') && (
          <TabsContent value="attendance">
            <Card className="p-0">
              <DataTable
                caption={t('employee.attendance')}
                columns={attendanceColumns}
                rows={attendance.data?.slice(0, 30)}
                getRowId={(r) => r.id}
                getRowLabel={(r) => r.date}
                loading={attendance.isPending}
                empty={<EmptyState icon={HistoryIcon} title={t('employee.noAttendance')} />}
              />
            </Card>
          </TabsContent>
        )}
        <TabsContent value="meals">
          <Card className="p-0">
            <DataTable
              caption={t('employee.meals')}
              columns={mealColumns}
              rows={meals.data}
              getRowId={(m) => m.id}
              getRowLabel={(m) => m.number}
              loading={meals.isPending}
              empty={<EmptyState icon={HistoryIcon} title={t('employee.noMeals')} />}
            />
          </Card>
        </TabsContent>
      </Tabs>

      <EntityHistory entity="employee" entityId={e.id} />
      <EmployeeDialog open={editing} onOpenChange={setEditing} employee={e} />
    </Screen>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 text-sm">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="break-words">{children}</div>
    </div>
  );
}
