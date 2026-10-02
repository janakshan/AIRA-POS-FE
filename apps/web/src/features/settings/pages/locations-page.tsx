import type { SettingsLocation } from '@rbp/types';
import {
  Badge,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  PageHeader,
  StatusBadge,
} from '@rbp/ui';
import { MapPinIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useSettingsLocations } from '../api/queries';
import { LocationDialog } from '../components/location-dialog';

/** SET-002 Locations: every branch, store and van (inactive ones too) and their POS settings. */
export function LocationsPage() {
  const { t } = useTranslation('settings');
  const locations = useSettingsLocations();
  const { current } = useMyLocations();
  const [editing, setEditing] = useState<SettingsLocation | null>(null);
  const [adding, setAdding] = useState(false);

  const columns: DataTableColumn<SettingsLocation>[] = [
    {
      id: 'name',
      header: t('locations.name'),
      primary: true,
      cell: (l) => (
        <span>
          <span className="font-medium">{l.name}</span>
          <span className="block text-xs text-muted-foreground">
            {l.code}
            {l.id === current?.id && ` · ${t('locations.current')}`}
          </span>
        </span>
      ),
    },
    {
      id: 'type',
      header: t('locations.type'),
      width: 'w-32',
      cell: (l) => <Badge variant="secondary">{t(`locationTypes.${l.type}`)}</Badge>,
    },
    {
      id: 'address',
      header: t('locations.address'),
      hideOnTablet: true,
      cell: (l) => <span className="text-sm">{l.address}</span>,
    },
    {
      id: 'tax',
      header: t('locations.tax'),
      width: 'w-28',
      cell: (l) => `${l.pos.taxLabel} ${l.pos.taxRateBps / 100}%`,
    },
    {
      id: 'users',
      header: t('locations.users'),
      align: 'right',
      width: 'w-24',
      cell: (l) => l.userCount,
    },
    {
      id: 'status',
      header: t('locations.status'),
      width: 'w-28',
      cell: (l) =>
        l.isActive ? (
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
    <Screen id="SET-002" title={t('locations.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('locations.title')}
        description={t('locations.hint')}
        actions={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon /> {t('locations.new')}
          </Button>
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('locations.caption')}
          columns={columns}
          rows={locations.data}
          getRowId={(l) => l.id}
          getRowLabel={(l) => l.name}
          loading={locations.isPending}
          onRowClick={setEditing}
          error={
            locations.isError ? (
              <QueryError error={locations.error} onRetry={() => locations.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={MapPinIcon} title={t('locations.empty')} />}
        />
      </Card>
      <LocationDialog
        open={adding || !!editing}
        onOpenChange={(open) => {
          if (!open) {
            setAdding(false);
            setEditing(null);
          }
        }}
        location={editing}
        defaults={locations.data?.find((l) => l.isActive)}
      />
    </Screen>
  );
}
