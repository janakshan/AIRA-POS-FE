import type { SettingsUser, UserStatus } from '@rbp/types';
import {
  Badge,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  FilterBar,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
} from '@rbp/ui';
import { PlusIcon, SearchXIcon, UsersRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useSettingsLocations, useSettingsUsers } from '../api/queries';
import { PasswordDialog } from '../components/password-dialog';
import { UserDialog } from '../components/user-dialog';

/** SET-003 Users: sign-ins, their roles, which locations they can open and their employee. */
export function UsersPage() {
  const { t } = useTranslation('settings');
  const list = useListParams({ filterKeys: ['status'] });
  const status = (list.filters.status as UserStatus | undefined) ?? undefined;
  const users = useSettingsUsers({
    ...(list.search ? { search: list.search } : {}),
    ...(status ? { status } : {}),
  });
  const locations = useSettingsLocations();
  const nameOf = (id: string) => locations.data?.find((l) => l.id === id)?.name ?? id;
  const [params, setParams] = useSearchParams();
  // `?employee=` comes from the employee page's "Create sign-in".
  const presetEmployee = params.get('employee');
  const [adding, setAdding] = useState(!!presetEmployee);
  const [editing, setEditing] = useState<SettingsUser | null>(null);
  const [resetting, setResetting] = useState<SettingsUser | null>(null);

  const columns: DataTableColumn<SettingsUser>[] = [
    {
      id: 'name',
      header: t('users.name'),
      primary: true,
      cell: (u) => (
        <span>
          <span className="font-medium">{u.displayName}</span>
          {u.isYou && (
            <Badge variant="secondary" className="ml-2">
              {t('users.you')}
            </Badge>
          )}
          <span className="block text-xs text-muted-foreground">{u.email}</span>
        </span>
      ),
    },
    {
      id: 'roles',
      header: t('users.roles'),
      cell: (u) => <span className="text-sm">{u.roles.map((r) => r.name).join(', ')}</span>,
    },
    {
      id: 'locations',
      header: t('users.locations'),
      hideOnTablet: true,
      cell: (u) => (
        <span className="text-sm">
          {u.locationIds.length === 0 ? t('allLocations') : u.locationIds.map(nameOf).join(', ')}
        </span>
      ),
    },
    {
      id: 'employee',
      header: t('users.employee'),
      hideOnTablet: true,
      cell: (u) => u.employee?.fullName ?? '—',
    },
    {
      id: 'status',
      header: t('users.status'),
      width: 'w-28',
      cell: (u) =>
        u.status === 'ACTIVE' ? (
          <StatusBadge tone="success" size="sm">
            {t('active')}
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral" size="sm">
            {t('inactive')}
          </StatusBadge>
        ),
    },
  ];

  return (
    <Screen id="SET-003" title={t('users.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('users.title')}
        description={t('users.hint')}
        actions={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon /> {t('users.new')}
          </Button>
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('users.caption')}
          columns={columns}
          rows={users.data}
          getRowId={(u) => u.id}
          getRowLabel={(u) => u.displayName}
          loading={users.isPending}
          onRowClick={setEditing}
          error={
            users.isError ? (
              <QueryError error={users.error} onRetry={() => users.refetch()} />
            ) : undefined
          }
          empty={
            list.search || status ? (
              <EmptyState icon={SearchXIcon} title={t('users.noResults')} />
            ) : (
              <EmptyState icon={UsersRoundIcon} title={t('users.empty')} />
            )
          }
          toolbar={
            <FilterBar
              search={
                <ListSearch
                  value={list.search}
                  onSearch={list.setSearch}
                  placeholder={t('users.searchPlaceholder')}
                  aria-label={t('users.search')}
                />
              }
              filters={
                <Select
                  value={status ?? 'all'}
                  onValueChange={(v) => list.setFilter('status', v === 'all' ? null : v)}
                >
                  <SelectTrigger className="w-full sm:w-40" aria-label={t('users.statusFilter')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('users.allStatuses')}</SelectItem>
                    <SelectItem value="ACTIVE">{t('active')}</SelectItem>
                    <SelectItem value="INACTIVE">{t('inactive')}</SelectItem>
                  </SelectContent>
                </Select>
              }
            />
          }
        />
      </Card>
      <UserDialog
        open={adding || !!editing}
        onOpenChange={(open) => {
          if (open) return;
          setAdding(false);
          setEditing(null);
          if (presetEmployee) {
            params.delete('employee');
            setParams(params, { replace: true });
          }
        }}
        user={editing}
        employeeId={editing ? null : presetEmployee}
        onResetPassword={setResetting}
      />
      <PasswordDialog user={resetting} onOpenChange={(open) => !open && setResetting(null)} />
    </Screen>
  );
}
