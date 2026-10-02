import { isApiError } from '@rbp/api-client';
import type { LocationType, SettingsLocation } from '@rbp/types';
import {
  Button,
  Checkbox,
  Input,
  NumberInput,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@rbp/ui';
import { locationSchema, toFieldErrors } from '@rbp/validation';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useErrorMessage } from '@/components/use-error-message';
import { useSaveLocation } from '../api/queries';
import { PercentInput } from './percent-input';

const TYPES: LocationType[] = ['RESTAURANT', 'RETAIL', 'BAKERY', 'MIXED', 'WAREHOUSE', 'VAN'];

/** SET-002 add or edit a location and its POS settings (tax, discount cap, returns, receipt). */
export function LocationDialog({
  open,
  onOpenChange,
  location,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location?: SettingsLocation | null;
  /** New locations copy the tax settings of an existing one. */
  defaults?: SettingsLocation;
}) {
  const { t } = useTranslation('settings');
  const errorMessage = useErrorMessage();
  const save = useSaveLocation();
  const ids = {
    code: useId(),
    name: useId(),
    type: useId(),
    address: useId(),
    taxLabel: useId(),
    taxRate: useId(),
    maxDiscount: useId(),
    returns: useId(),
    footer: useId(),
  };
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<LocationType>('RETAIL');
  const [address, setAddress] = useState('');
  const [active, setActive] = useState(true);
  const [taxLabel, setTaxLabel] = useState('');
  const [taxRate, setTaxRate] = useState<number | null>(null);
  const [maxDiscount, setMaxDiscount] = useState<number | null>(null);
  const [returns, setReturns] = useState<number | null>(null);
  const [footer, setFooter] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const pos = location?.pos ?? defaults?.pos;
      setCode(location?.code ?? '');
      setName(location?.name ?? '');
      setType(location?.type ?? 'RETAIL');
      setAddress(location?.address ?? '');
      setActive(location?.isActive ?? true);
      setTaxLabel(pos?.taxLabel ?? 'VAT');
      setTaxRate(pos?.taxRateBps ?? 0);
      setMaxDiscount(pos?.maxDiscountBps ?? 5000);
      setReturns(pos?.returnWindowDays ?? 30);
      setFooter(location ? location.pos.receiptFooter : 'Thank you!');
      setErrors({});
    }
  }

  const submit = () => {
    const parsed = locationSchema.safeParse({
      code,
      name,
      type,
      address,
      isActive: active,
      pos: {
        taxLabel,
        taxRateBps: taxRate ?? Number.NaN,
        maxDiscountBps: maxDiscount ?? Number.NaN,
        returnWindowDays: returns ?? Number.NaN,
        receiptFooter: footer,
      },
    });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(
      { ...(location ? { id: location.id } : {}), body: parsed.data },
      {
        onSuccess: (l) => {
          toast.success(t(location ? 'locations.updated' : 'locations.created', { name: l.name }));
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

  const field = (id: string, key: string, label: string, control: ReactNode, wide = false) => (
    <div className={wide ? 'space-y-1.5 sm:col-span-2' : 'space-y-1.5'}>
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

  const service = location?.serviceChargeBps ?? 0;

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !save.isPending && onOpenChange(o)}
      title={location ? t('locations.editTitle', { name: location.name }) : t('locations.newTitle')}
      description={location ? undefined : t('locations.newHint')}
      closeLabel={t('close')}
      size="lg"
      footer={
        <Button size="pos" className="w-full sm:w-auto" loading={save.isPending} onClick={submit}>
          {t('save')}
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {field(
          ids.code,
          'code',
          t('locations.code'),
          <Input
            id={ids.code}
            value={code}
            maxLength={8}
            className="uppercase"
            onChange={(e) => setCode(e.target.value)}
          />,
        )}
        {field(
          ids.type,
          'type',
          t('locations.type'),
          <Select value={type} onValueChange={(v) => setType(v as LocationType)}>
            <SelectTrigger id={ids.type} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((x) => (
                <SelectItem key={x} value={x}>
                  {t(`locationTypes.${x}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
        )}
        {field(
          ids.name,
          'name',
          t('locations.name'),
          <Input
            id={ids.name}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />,
          true,
        )}
        {field(
          ids.address,
          'address',
          t('locations.address'),
          <Input
            id={ids.address}
            value={address}
            maxLength={160}
            onChange={(e) => setAddress(e.target.value)}
          />,
          true,
        )}

        <h3 className="pt-2 font-semibold sm:col-span-2">{t('locations.pos')}</h3>
        {field(
          ids.taxLabel,
          'pos.taxLabel',
          t('locations.taxLabel'),
          <Input
            id={ids.taxLabel}
            value={taxLabel}
            maxLength={12}
            onChange={(e) => setTaxLabel(e.target.value)}
          />,
        )}
        {field(
          ids.taxRate,
          'pos.taxRateBps',
          t('locations.taxRate'),
          <PercentInput id={ids.taxRate} value={taxRate} onChange={setTaxRate} />,
        )}
        {field(
          ids.maxDiscount,
          'pos.maxDiscountBps',
          t('locations.maxDiscount'),
          <PercentInput id={ids.maxDiscount} value={maxDiscount} onChange={setMaxDiscount} />,
        )}
        {field(
          ids.returns,
          'pos.returnWindowDays',
          t('locations.returnWindow'),
          <NumberInput id={ids.returns} value={returns} onChange={setReturns} min={0} max={365} />,
        )}
        {field(
          ids.footer,
          'pos.receiptFooter',
          t('locations.receiptFooter'),
          <Textarea
            id={ids.footer}
            value={footer}
            maxLength={120}
            rows={2}
            onChange={(e) => setFooter(e.target.value)}
          />,
          true,
        )}
        {location && (
          <p className="text-sm text-muted-foreground sm:col-span-2">
            {service
              ? t('locations.serviceCharge', { rate: `${service / 100}%` })
              : t('locations.serviceNone')}{' '}
            ·{' '}
            <Link to="/settings/charges" className="underline underline-offset-2">
              {t('locations.editCharges')}
            </Link>
          </p>
        )}
        {location && (
          <label className="flex items-start gap-2 text-sm sm:col-span-2 pointer-coarse:min-h-11">
            <Checkbox checked={active} onCheckedChange={(v) => setActive(v === true)} />
            <span>
              <span className="font-medium">{t('active')}</span>
              <span className="block text-muted-foreground">{t('locations.activeHint')}</span>
            </span>
          </label>
        )}
      </div>
    </ResponsiveDialog>
  );
}
