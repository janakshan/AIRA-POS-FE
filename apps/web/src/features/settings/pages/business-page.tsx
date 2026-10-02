import { isApiError } from '@rbp/api-client';
import type { BusinessSettings } from '@rbp/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  ColorSwatchPicker,
  Input,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@rbp/ui';
import { businessSchema, toFieldErrors } from '@rbp/validation';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useBusinessSettings, useSaveBusiness } from '../api/queries';

const TIMEZONES = ['Asia/Colombo', 'Asia/Kolkata', 'Asia/Dubai', 'UTC'];
const DEFAULT_SWATCH = 'oklch(0.55 0.15 265)';

/** SET-001 Business: name, logo letters, brand colour, receipt header details and time zone. */
export function BusinessPage() {
  const { t } = useTranslation('settings');
  const business = useBusinessSettings();
  return (
    <Screen id="SET-001" title={t('business.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('business.title')}
        description={t('business.hint')}
      />
      {business.isError ? (
        <Card>
          <QueryError error={business.error} onRetry={() => void business.refetch()} />
        </Card>
      ) : !business.data ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <BusinessForm initial={business.data} />
      )}
    </Screen>
  );
}

function BusinessForm({ initial }: { initial: BusinessSettings }) {
  const { t } = useTranslation('settings');
  const errorMessage = useErrorMessage();
  const save = useSaveBusiness();
  const { current } = useMyLocations();
  const ids = { name: useId(), logo: useId(), phone: useId(), tax: useId(), tz: useId() };
  const [saved, setSaved] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [logoText, setLogoText] = useState(initial.logoText);
  const [primaryColor, setPrimaryColor] = useState<string | null>(initial.primaryColor);
  const [phone, setPhone] = useState(initial.phone);
  const [taxRegNo, setTaxRegNo] = useState(initial.taxRegNo);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const body = { name, logoText, primaryColor, phone, taxRegNo, timezone };
  const dirty = (Object.keys(body) as (keyof typeof body)[]).some((k) => body[k] !== saved[k]);
  const guard = useUnsavedChangesGuard(dirty && !save.isPending);

  const submit = () => {
    const parsed = businessSchema.safeParse(body);
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(parsed.data, {
      onSuccess: (next) => {
        setSaved(next);
        setLogoText(next.logoText);
        toast.success(t('business.saved'));
      },
      onError: (e) => {
        const fe = isApiError(e) ? e.details?.fieldErrors : undefined;
        if (fe && typeof fe === 'object') setErrors(fe as Record<string, string>);
        toast.error(errorMessage(e));
      },
    });
  };

  const field = (id: string, key: string, label: string, control: ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {errors[key] ? (
        <p className="text-xs text-status-danger-fg" role="alert">
          {t(`common:${errors[key]}`)}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {field(
            ids.name,
            'name',
            t('business.name'),
            <Input
              id={ids.name}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />,
          )}
          {field(
            ids.logo,
            'logoText',
            t('business.logoText'),
            <Input
              id={ids.logo}
              value={logoText}
              maxLength={3}
              className="uppercase"
              onChange={(e) => setLogoText(e.target.value)}
            />,
            t('business.logoTextHint'),
          )}
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">{t('business.color')}</legend>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={primaryColor === null}
                onCheckedChange={(v) => setPrimaryColor(v === true ? null : DEFAULT_SWATCH)}
              />
              {t('business.defaultColor')}
            </label>
            {primaryColor !== null && (
              <ColorSwatchPicker
                value={primaryColor}
                onChange={setPrimaryColor}
                label={t('business.color')}
                customLabel={t('business.customColor')}
              />
            )}
          </fieldset>
          {field(
            ids.phone,
            'phone',
            t('business.phone'),
            <Input
              id={ids.phone}
              type="tel"
              value={phone}
              maxLength={30}
              onChange={(e) => setPhone(e.target.value)}
            />,
            t('business.receiptHint'),
          )}
          {field(
            ids.tax,
            'taxRegNo',
            t('business.taxRegNo'),
            <Input
              id={ids.tax}
              value={taxRegNo}
              maxLength={30}
              onChange={(e) => setTaxRegNo(e.target.value)}
            />,
            t('business.receiptHint'),
          )}
          {field(
            ids.tz,
            'timezone',
            t('business.timezone'),
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger id={ids.tz} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...TIMEZONES, timezone])].map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {t(`timezones.${tz}`, { defaultValue: tz })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>,
          )}
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('business.currency')}</p>
            <p className="flex min-h-10 items-center font-mono text-sm">{initial.currency}</p>
            <p className="text-xs text-muted-foreground">{t('business.currencyHint')}</p>
          </div>
          <div className="flex justify-end sm:col-span-2">
            <Button size="pos" loading={save.isPending} disabled={!dirty} onClick={submit}>
              {t('save')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card aria-label={t('business.preview')} role="region">
        <CardHeader>
          <CardTitle className="text-base">{t('business.preview')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2.5 rounded-lg bg-sidebar p-3 text-sidebar-accent-foreground">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
              style={primaryColor ? { backgroundColor: primaryColor } : undefined}
            >
              {logoText.toUpperCase() || '?'}
            </span>
            <span className="truncate text-sm font-semibold">{name}</span>
          </div>
          <div className="rounded-md border border-dashed bg-white p-3 text-center font-mono text-xs text-neutral-900">
            <p className="sr-only">{t('business.receiptPreview')}</p>
            <p className="text-sm font-bold">{name}</p>
            {current && (
              <>
                <p>{current.name}</p>
                <p>{current.address}</p>
              </>
            )}
            {phone.trim() && <p>{t('pos:receipt.phone', { phone: phone.trim() })}</p>}
            {taxRegNo.trim() && <p>{t('pos:receipt.taxRegNo', { number: taxRegNo.trim() })}</p>}
          </div>
        </CardContent>
      </Card>
      {guard.dialog}
    </div>
  );
}
