import { isApiError } from '@rbp/api-client';
import type { SettingsStation } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  DataTable,
  type DataTableColumn,
  EmptyState,
  Input,
  PageHeader,
  ResponsiveDialog,
  Skeleton,
  toast,
} from '@rbp/ui';
import { stationSchema, toFieldErrors } from '@rbp/validation';
import { ChefHatIcon, PlusIcon, PrinterIcon, Trash2Icon } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useDeleteStation,
  usePrinterSettings,
  useSaveReceiptPrinter,
  useSaveStation,
} from '../api/queries';

/** SET-008 Printers: each location's receipt printer and kitchen stations (KOT printers). */
export function PrintersPage() {
  const { t } = useTranslation('settings');
  const { current } = useMyLocations();
  const [locationId, setLocationId] = useState('');
  const selected = locationId || current?.id || '';
  const printers = usePrinterSettings(selected);
  const [editing, setEditing] = useState<SettingsStation | null>(null);
  const [adding, setAdding] = useState(false);

  const columns: DataTableColumn<SettingsStation>[] = [
    {
      id: 'name',
      header: t('printers.stationName'),
      primary: true,
      cell: (s) => (
        <span>
          <span className="font-medium">{s.name}</span>
          <span className="block text-xs text-muted-foreground">{s.code}</span>
        </span>
      ),
    },
    { id: 'printer', header: t('printers.printerName'), cell: (s) => s.printerName },
    {
      id: 'products',
      header: t('printers.products'),
      align: 'right',
      width: 'w-28',
      cell: (s) => s.productCount,
    },
  ];

  return (
    <Screen id="SET-008" title={t('printers.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('printers.title')}
        description={t('printers.hint')}
        actions={
          <LocationSelect
            value={selected}
            onChange={setLocationId}
            label={t('printers.location')}
          />
        }
      />
      <Alert tone="info" title={t('printers.simulated')} />
      {printers.isError ? (
        <Card>
          <QueryError error={printers.error} onRetry={() => void printers.refetch()} />
        </Card>
      ) : !printers.data ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : (
        <>
          <ReceiptPrinterCard
            key={`${printers.data.locationId}:${printers.data.receiptPrinter}`}
            locationId={printers.data.locationId}
            initial={printers.data.receiptPrinter}
          />
          <Card className="p-0">
            <CardHeader className="flex flex-row items-start justify-between gap-3 px-5 pt-5">
              <div className="space-y-1">
                <CardTitle>{t('printers.stations')}</CardTitle>
                <CardDescription>{t('printers.stationsHint')}</CardDescription>
              </div>
              <Button variant="outline" onClick={() => setAdding(true)}>
                <PlusIcon /> {t('printers.newStation')}
              </Button>
            </CardHeader>
            <DataTable
              caption={t('printers.stations')}
              columns={columns}
              rows={printers.data.stations}
              getRowId={(s) => s.id}
              getRowLabel={(s) => s.name}
              onRowClick={setEditing}
              empty={<EmptyState icon={ChefHatIcon} title={t('printers.empty')} />}
            />
          </Card>
        </>
      )}
      <StationDialog
        open={adding || !!editing}
        onOpenChange={(open) => {
          if (open) return;
          setAdding(false);
          setEditing(null);
        }}
        station={editing}
        locationId={selected}
      />
    </Screen>
  );
}

function ReceiptPrinterCard({ locationId, initial }: { locationId: string; initial: string }) {
  const { t } = useTranslation('settings');
  const errorMessage = useErrorMessage();
  const save = useSaveReceiptPrinter();
  const id = useId();
  const [name, setName] = useState(initial);
  const dirty = name.trim() !== initial;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PrinterIcon className="size-5" /> {t('printers.receipt')}
        </CardTitle>
        <CardDescription>{t('printers.receiptHint')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1.5">
          <label htmlFor={id} className="text-sm font-medium">
            {t('printers.printerName')}
          </label>
          <Input id={id} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          variant="outline"
          onClick={() => toast.success(t('printers.testSent', { printer: initial }))}
        >
          {t('printers.testPrint')}
        </Button>
        <Button
          loading={save.isPending}
          disabled={!dirty || name.trim().length < 2}
          onClick={() =>
            save.mutate(
              { locationId, receiptPrinter: name.trim() },
              {
                onSuccess: () => toast.success(t('printers.receiptSaved')),
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        >
          {t('save')}
        </Button>
      </CardContent>
    </Card>
  );
}

function StationDialog({
  open,
  onOpenChange,
  station,
  locationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  station: SettingsStation | null;
  locationId: string;
}) {
  const { t } = useTranslation('settings');
  const errorMessage = useErrorMessage();
  const save = useSaveStation();
  const remove = useDeleteStation();
  const ids = { name: useId(), code: useId(), printer: useId() };
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [printerName, setPrinterName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(station?.name ?? '');
      setCode(station?.code ?? '');
      setPrinterName(station?.printerName ?? '');
      setErrors({});
      setConfirming(false);
    }
  }

  const submit = () => {
    const parsed = stationSchema.safeParse({
      locationId: station?.locationId ?? locationId,
      code,
      name,
      printerName,
    });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(
      { ...(station ? { id: station.id } : {}), body: parsed.data },
      {
        onSuccess: (s) => {
          toast.success(
            t(station ? 'printers.stationSaved' : 'printers.stationCreated', { name: s.name }),
          );
          onOpenChange(false);
        },
        onError: (e) => {
          const fe = isApiError(e) ? e.details?.fieldErrors : undefined;
          if (fe && typeof fe === 'object') setErrors(fe as Record<string, string>);
          toast.error(errorMessage(e));
        },
      },
    );
  };

  const field = (id: string, key: string, label: string, control: ReactNode) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {errors[key] && (
        <p className="text-xs text-status-danger-fg" role="alert">
          {t(`common:${errors[key]}`)}
        </p>
      )}
    </div>
  );

  return (
    <>
      <ResponsiveDialog
        open={open && !confirming}
        onOpenChange={(o) => !save.isPending && onOpenChange(o)}
        title={station ? t('printers.editTitle', { name: station.name }) : t('printers.newTitle')}
        closeLabel={t('close')}
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {station ? (
              <Button variant="outline" onClick={() => setConfirming(true)}>
                <Trash2Icon /> {t('printers.delete')}
              </Button>
            ) : (
              <span />
            )}
            <Button size="pos" loading={save.isPending} onClick={submit}>
              {t('save')}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          {field(
            ids.name,
            'name',
            t('printers.stationName'),
            <Input
              id={ids.name}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
            />,
          )}
          {field(
            ids.code,
            'code',
            t('printers.code'),
            <Input
              id={ids.code}
              value={code}
              maxLength={6}
              className="uppercase"
              onChange={(e) => setCode(e.target.value)}
            />,
          )}
          <div className="sm:col-span-2">
            {field(
              ids.printer,
              'printerName',
              t('printers.printerName'),
              <Input
                id={ids.printer}
                value={printerName}
                maxLength={40}
                onChange={(e) => setPrinterName(e.target.value)}
              />,
            )}
          </div>
        </div>
      </ResponsiveDialog>
      {station && (
        <ConfirmDialog
          open={open && confirming}
          onOpenChange={(o) => !o && setConfirming(false)}
          title={t('printers.deleteTitle', { name: station.name })}
          description={t('printers.deleteBody')}
          confirmLabel={t('printers.delete')}
          cancelLabel={t('cancel')}
          destructive
          loading={remove.isPending}
          onConfirm={() =>
            remove.mutate(station.id, {
              onSuccess: () => {
                toast.success(t('printers.stationDeleted', { name: station.name }));
                onOpenChange(false);
              },
              onError: (e) => {
                setConfirming(false);
                toast.error(errorMessage(e));
              },
            })
          }
        />
      )}
    </>
  );
}
