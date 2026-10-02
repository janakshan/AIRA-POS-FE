import { PERMISSIONS, type SettingsRole } from '@rbp/types';
import {
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  PageHeader,
  StatusBadge,
} from '@rbp/ui';
import { CopyIcon, LockIcon, PlusIcon, ShieldIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useSettingsRoles } from '../api/queries';

/** SET-004 Roles & permissions: what each role can do and how many sign-ins hold it. */
export function RolesPage() {
  const { t } = useTranslation('settings');
  const navigate = useNavigate();
  const roles = useSettingsRoles();

  const columns: DataTableColumn<SettingsRole>[] = [
    {
      id: 'name',
      header: t('roles.name'),
      primary: true,
      cell: (r) => (
        <span className="flex items-center gap-2 font-medium">
          {r.name}
          {r.locked && (
            <StatusBadge tone="neutral" size="sm">
              <LockIcon className="size-3" /> {t('roles.locked')}
            </StatusBadge>
          )}
        </span>
      ),
    },
    {
      id: 'users',
      header: t('roles.users'),
      align: 'right',
      width: 'w-28',
      cell: (r) => r.userCount,
    },
    {
      id: 'permissions',
      header: t('roles.permissions'),
      align: 'right',
      width: 'w-32',
      cell: (r) =>
        t('roles.permissionCount', { count: r.permissions.length, total: PERMISSIONS.length }),
    },
    {
      id: 'copy',
      header: <span className="sr-only">{t('roles.copy')}</span>,
      align: 'right',
      width: 'w-28',
      cell: (r) => (
        <Button variant="ghost" size="sm" asChild>
          <Link
            to={`/settings/roles/new?copy=${r.id}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${t('roles.copy')}: ${r.name}`}
          >
            <CopyIcon /> {t('roles.copy')}
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <Screen id="SET-004" title={t('roles.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('roles.title')}
        description={t('roles.hint')}
        actions={
          <Button asChild>
            <Link to="/settings/roles/new">
              <PlusIcon /> {t('roles.new')}
            </Link>
          </Button>
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('roles.caption')}
          columns={columns}
          rows={roles.data}
          getRowId={(r) => r.id}
          getRowLabel={(r) => r.name}
          loading={roles.isPending}
          onRowClick={(r) => navigate(`/settings/roles/${r.id}`)}
          error={
            roles.isError ? (
              <QueryError error={roles.error} onRetry={() => roles.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={ShieldIcon} title={t('roles.caption')} />}
        />
      </Card>
    </Screen>
  );
}
