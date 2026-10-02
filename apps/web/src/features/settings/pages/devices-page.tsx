import type { SettingsDevice } from '@rbp/types';
import {
  Badge,
  Button,
  Card,
  DataTable,
  type DataTableColumn,
  EmptyState,
  PageHeader,
  StatusBadge,
  toast,
} from '@rbp/ui';
import { MonitorSmartphoneIcon, PlusIcon, QrCodeIcon } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useMe } from '@/features/auth/api/queries';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useSessionStore } from '@/stores/session-store';
import { useSettingsDevices } from '../api/queries';
import { DeviceDialog, PairingDialog } from '../components/device-dialogs';

/** SET-005 Devices: registered tills, tablets and kitchen screens and their location (§8). */
export function DevicesPage() {
  const { t } = useTranslation('settings');
  const devices = useSettingsDevices();
  const { data: me } = useMe();
  const deviceId = useSessionStore((s) => s.deviceId);
  const setDevice = useSessionStore((s) => s.setDevice);
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<SettingsDevice | null>(null);
  const [pairing, setPairing] = useState<SettingsDevice | null>(null);
  const here = me?.currentLocation?.id;

  const pickDevice = (d: SettingsDevice) => {
    setDevice(d.id);
    // /me is keyed by location, not device: refetch it so the POS header shows the new device.
    void queryClient.invalidateQueries({ queryKey: ['me'] });
    toast.success(t('devices.usingHere', { name: d.name }));
  };

  const columns: DataTableColumn<SettingsDevice>[] = [
    {
      id: 'name',
      header: t('devices.name'),
      primary: true,
      cell: (d) => (
        <span>
          <span className="font-medium">{d.name}</span>
          {d.id === deviceId && (
            <Badge variant="secondary" className="ml-2">
              {t('devices.thisBrowser')}
            </Badge>
          )}
          <span className="block text-xs text-muted-foreground">
            {d.paired ? t('devices.paired') : t('devices.notPaired')}
          </span>
        </span>
      ),
    },
    {
      id: 'type',
      header: t('devices.type'),
      width: 'w-40',
      cell: (d) => <Badge variant="secondary">{t(`devices.types.${d.type}`)}</Badge>,
    },
    { id: 'location', header: t('devices.location'), cell: (d) => d.locationName },
    {
      id: 'status',
      header: t('devices.status'),
      width: 'w-28',
      cell: (d) =>
        d.isActive ? (
          <StatusBadge tone="success" size="sm">
            {t('active')}
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral" size="sm">
            {t('inactive')}
          </StatusBadge>
        ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">{t('devices.code')}</span>,
      align: 'right',
      width: 'w-64',
      cell: (d) => (
        <span className="inline-flex flex-wrap justify-end gap-1">
          {d.isActive && d.locationId === here && d.id !== deviceId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                pickDevice(d);
              }}
              aria-label={`${t('devices.useHere')}: ${d.name}`}
            >
              {t('devices.useHere')}
            </Button>
          )}
          {d.isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setPairing(d);
              }}
              aria-label={`${t('devices.code')}: ${d.name}`}
            >
              <QrCodeIcon /> {t('devices.code')}
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <Screen id="SET-005" title={t('devices.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('devices.title')}
        description={t('devices.hint')}
        actions={
          <Button onClick={() => setAdding(true)}>
            <PlusIcon /> {t('devices.new')}
          </Button>
        }
      />
      <Card className="p-0">
        <DataTable
          caption={t('devices.caption')}
          columns={columns}
          rows={devices.data}
          getRowId={(d) => d.id}
          getRowLabel={(d) => d.name}
          loading={devices.isPending}
          onRowClick={setEditing}
          error={
            devices.isError ? (
              <QueryError error={devices.error} onRetry={() => devices.refetch()} />
            ) : undefined
          }
          empty={<EmptyState icon={MonitorSmartphoneIcon} title={t('devices.empty')} />}
        />
      </Card>
      <p className="text-sm text-muted-foreground">{t('devices.useHereHint')}</p>
      <DeviceDialog
        open={adding || !!editing}
        onOpenChange={(open) => {
          if (open) return;
          setAdding(false);
          setEditing(null);
        }}
        device={editing}
        {...(here ? { defaultLocationId: here } : {})}
        onCreated={setPairing}
      />
      <PairingDialog device={pairing} onOpenChange={(open) => !open && setPairing(null)} />
    </Screen>
  );
}
