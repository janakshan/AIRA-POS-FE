import { isApiError } from '@rbp/api-client';
import type { DeviceType, SettingsDevice } from '@rbp/types';
import {
  Button,
  Checkbox,
  Input,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@rbp/ui';
import { deviceSchema, toFieldErrors } from '@rbp/validation';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useNewDeviceCode, useSaveDevice, useSettingsLocations } from '../api/queries';

const DEVICE_TYPES: DeviceType[] = ['POS_TERMINAL', 'TABLET', 'KITCHEN_DISPLAY', 'BACK_OFFICE'];

/** SET-005 add or edit a device. A new device opens its pairing code next. */
export function DeviceDialog({
  open,
  onOpenChange,
  device,
  defaultLocationId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  device?: SettingsDevice | null;
  defaultLocationId?: string;
  onCreated: (device: SettingsDevice) => void;
}) {
  const { t } = useTranslation('settings');
  const errorMessage = useErrorMessage();
  const save = useSaveDevice();
  const locations = useSettingsLocations();
  const ids = { name: useId(), type: useId(), location: useId() };
  const [name, setName] = useState('');
  const [type, setType] = useState<DeviceType>('POS_TERMINAL');
  const [locationId, setLocationId] = useState('');
  const [active, setActive] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(device?.name ?? '');
      setType(device?.type ?? 'POS_TERMINAL');
      setLocationId(device?.locationId ?? defaultLocationId ?? '');
      setActive(device?.isActive ?? true);
      setErrors({});
    }
  }

  const submit = () => {
    const parsed = deviceSchema.safeParse({ name, type, locationId, isActive: active });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(
      { ...(device ? { id: device.id } : {}), body: parsed.data },
      {
        onSuccess: (d) => {
          toast.success(t(device ? 'devices.updated' : 'devices.created', { name: d.name }));
          onOpenChange(false);
          if (!device) onCreated(d);
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
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !save.isPending && onOpenChange(o)}
      title={device ? t('devices.editTitle', { name: device.name }) : t('devices.newTitle')}
      closeLabel={t('close')}
      footer={
        <Button size="pos" className="w-full sm:w-auto" loading={save.isPending} onClick={submit}>
          {t('save')}
        </Button>
      }
    >
      <div className="grid gap-4">
        {field(
          ids.name,
          'name',
          t('devices.name'),
          <Input
            id={ids.name}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />,
        )}
        {field(
          ids.type,
          'type',
          t('devices.type'),
          <Select value={type} onValueChange={(v) => setType(v as DeviceType)}>
            <SelectTrigger id={ids.type} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DEVICE_TYPES.map((x) => (
                <SelectItem key={x} value={x}>
                  {t(`devices.types.${x}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
        )}
        {field(
          ids.location,
          'locationId',
          t('devices.location'),
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger id={ids.location} className="w-full">
              <SelectValue placeholder={t('devices.location')} />
            </SelectTrigger>
            <SelectContent>
              {locations.data
                ?.filter((l) => l.isActive || l.id === locationId)
                .map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>,
        )}
        {device && (
          <label className="flex items-start gap-2 text-sm pointer-coarse:min-h-11">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            <span>
              <span className="font-medium">{t('active')}</span>
              <span className="block text-muted-foreground">{t('devices.activeHint')}</span>
            </span>
          </label>
        )}
      </div>
    </ResponsiveDialog>
  );
}

const QR_SIZE = 21;
const EYES: [number, number][] = [
  [0, 0],
  [QR_SIZE - 7, 0],
  [0, QR_SIZE - 7],
];

/** Dark modules for a QR-looking pattern derived from the code (pairing is simulated). */
function patternCells(code: string): [number, number][] {
  let h = 2166136261;
  for (const ch of code) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const cells: [number, number][] = [];
  for (let y = 0; y < QR_SIZE; y++) {
    for (let x = 0; x < QR_SIZE; x++) {
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      const inEye = EYES.some(([fx, fy]) => x >= fx && x < fx + 7 && y >= fy && y < fy + 7);
      if (!inEye && (h >>> 0) % 2 === 0) cells.push([x, y]);
    }
  }
  return cells;
}

function PairingPattern({ code }: { code: string }) {
  return (
    <svg
      viewBox={`-1 -1 ${QR_SIZE + 2} ${QR_SIZE + 2}`}
      className="size-40 rounded-md bg-white"
      aria-hidden
      fill="black"
    >
      {patternCells(code).map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
      ))}
      {EYES.map(([x, y]) => (
        <g key={`eye-${x}-${y}`}>
          <rect x={x} y={y} width={7} height={7} />
          <rect x={x + 1} y={y + 1} width={5} height={5} fill="white" />
          <rect x={x + 2} y={y + 2} width={3} height={3} />
        </g>
      ))}
    </svg>
  );
}

/** SET-005 show a device's activation code (simulated QR / code pairing, §8). */
export function PairingDialog({
  device,
  onOpenChange,
}: {
  device: SettingsDevice | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('settings');
  const errorMessage = useErrorMessage();
  const newCode = useNewDeviceCode();
  // A re-issued code replaces the one the dialog opened with.
  const [reissued, setReissued] = useState<SettingsDevice | null>(null);
  const current = reissued && reissued.id === device?.id ? reissued : device;

  return (
    <ResponsiveDialog
      open={!!device}
      onOpenChange={onOpenChange}
      title={t('devices.codeTitle', { name: current?.name ?? '' })}
      description={t('devices.codeHint', { location: current?.locationName ?? '' })}
      closeLabel={t('close')}
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button
            variant="outline"
            loading={newCode.isPending}
            onClick={() =>
              current &&
              newCode.mutate(current.id, {
                onSuccess: setReissued,
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            {t('devices.newCode')}
          </Button>
          <Button size="pos" onClick={() => onOpenChange(false)}>
            {t('devices.done')}
          </Button>
        </div>
      }
    >
      {current && (
        <div className="flex flex-col items-center gap-4 py-2">
          <PairingPattern code={current.activationCode} />
          <p className="text-sm text-muted-foreground">{t('devices.code')}</p>
          <p
            className="font-mono text-3xl font-semibold tracking-[0.3em] tabular-nums"
            aria-label={`${t('devices.code')}: ${current.activationCode.split('').join(' ')}`}
          >
            {current.activationCode}
          </p>
        </div>
      )}
    </ResponsiveDialog>
  );
}
