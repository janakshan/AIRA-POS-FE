import { isApiError } from '@rbp/api-client';
import type { AdjustmentMode, ChargeSetting } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Input,
  MoneyInput,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  toast,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { chargeSettingsSchema, toFieldErrors } from '@rbp/validation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { useTenantCurrency } from '@/features/catalog/lib/currency';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useChargeSettings, useSaveCharges } from '../api/queries';
import { PercentInput } from '../components/percent-input';

/** SET-007 Charges: per location, which POS-005 charges exist and their defaults (A-213). */
export function ChargesPage() {
  const { t } = useTranslation('settings');
  const { current, nameOf } = useMyLocations();
  const [locationId, setLocationId] = useState('');
  const selected = locationId || current?.id || '';
  const settings = useChargeSettings(selected);
  const save = useSaveCharges();
  const errorMessage = useErrorMessage();

  // Local edits, reset whenever a different location's settings arrive.
  const [draft, setDraft] = useState<ChargeSetting[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (settings.data && !settings.isPlaceholderData && loadedFor !== settings.data.locationId) {
    setLoadedFor(settings.data.locationId);
    setDraft(settings.data.charges);
    setErrors({});
  }
  const dirty =
    !!draft && !!settings.data && JSON.stringify(draft) !== JSON.stringify(settings.data.charges);
  const guard = useUnsavedChangesGuard(dirty && !save.isPending);

  const patch = (code: ChargeSetting['code'], change: Partial<ChargeSetting>) =>
    setDraft((rows) => rows?.map((r) => (r.code === code ? { ...r, ...change } : r)) ?? rows);

  const submit = () => {
    if (!draft) return;
    const parsed = chargeSettingsSchema.safeParse({ charges: draft });
    if (!parsed.success) {
      setErrors(toFieldErrors(parsed.error));
      return;
    }
    setErrors({});
    save.mutate(
      { locationId: selected, body: parsed.data },
      {
        onSuccess: (saved) => {
          setDraft(saved.charges);
          toast.success(t('charges.saved', { location: nameOf(selected) }));
        },
        onError: (e) => {
          const fe = isApiError(e) ? e.details?.fieldErrors : undefined;
          if (fe && typeof fe === 'object') setErrors(fe as Record<string, string>);
          toast.error(errorMessage(e));
        },
      },
    );
  };

  return (
    <Screen id="SET-007" title={t('charges.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('charges.title')}
        description={t('charges.hint')}
        actions={
          <LocationSelect
            value={selected}
            onChange={(v) => {
              setLocationId(v);
              setLoadedFor(null);
              setDraft(null);
            }}
            label={t('charges.location')}
          />
        }
      />
      <Alert tone="info" title={t('charges.openSales')} />
      {settings.isError ? (
        <Card>
          <QueryError error={settings.error} onRetry={() => void settings.refetch()} />
        </Card>
      ) : !draft ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {draft.map((row, i) => (
              <ChargeCard
                key={row.code}
                row={row}
                error={(field) => errors[`charges.${i}.${field}`]}
                onChange={(change) => patch(row.code, change)}
              />
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={!dirty || save.isPending}
              onClick={() => {
                setDraft(settings.data?.charges ?? null);
                setErrors({});
              }}
            >
              {t('cancel')}
            </Button>
            <Button size="pos" loading={save.isPending} disabled={!dirty} onClick={submit}>
              {t('save')}
            </Button>
          </div>
        </>
      )}
      {guard.dialog}
    </Screen>
  );
}

function ChargeCard({
  row,
  error,
  onChange,
}: {
  row: ChargeSetting;
  error: (field: string) => string | undefined;
  onChange: (change: Partial<ChargeSetting>) => void;
}) {
  const { t } = useTranslation('settings');
  const { currency, symbol } = useTenantCurrency();
  const service = row.code === 'SERVICE';
  const other = row.code === 'OTHER';
  const id = `charge-${row.code}`;

  const message = (field: string) => {
    const key = error(field);
    return key ? (
      <p className="text-xs text-status-danger-fg" role="alert">
        {t(`common:${key}`)}
      </p>
    ) : null;
  };

  return (
    <Card aria-label={t(`charges.codes.${row.code}`)} role="region">
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">{t(`charges.codes.${row.code}`)}</h2>
          <label className="flex items-center gap-2 text-sm">
            {t('charges.offered')}
            <Switch
              checked={row.offered}
              onCheckedChange={(offered) => onChange({ offered })}
              aria-label={`${t('charges.offered')}: ${t(`charges.codes.${row.code}`)}`}
            />
          </label>
        </div>
        <fieldset
          disabled={!row.offered}
          className={cn('grid gap-3 sm:grid-cols-2', !row.offered && 'opacity-50')}
        >
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={`${id}-name`} className="text-sm font-medium">
              {t('charges.name')}
            </label>
            <Input
              id={`${id}-name`}
              value={row.name}
              maxLength={40}
              onChange={(e) => onChange({ name: e.target.value })}
            />
            {message('name')}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-mode`} className="text-sm font-medium">
              {t('charges.mode')}
            </label>
            <Select
              value={row.mode}
              disabled={service || !row.offered}
              onValueChange={(mode) =>
                onChange({ mode: mode as AdjustmentMode, ...(other ? {} : { defaultValue: null }) })
              }
            >
              <SelectTrigger id={`${id}-mode`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PERCENT">{t('charges.modes.PERCENT')}</SelectItem>
                <SelectItem value="FIXED">{t('charges.modes.FIXED')}</SelectItem>
              </SelectContent>
            </Select>
            {message('mode')}
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${id}-default`} className="text-sm font-medium">
              {t('charges.default')}
            </label>
            {other ? (
              <p className="flex min-h-10 items-center text-sm text-muted-foreground">
                {t('charges.noDefault')}
              </p>
            ) : row.mode === 'PERCENT' ? (
              <PercentInput
                id={`${id}-default`}
                value={row.defaultValue}
                onChange={(defaultValue) => onChange({ defaultValue })}
              />
            ) : (
              <MoneyInput
                id={`${id}-default`}
                value={row.defaultValue === null ? null : { amount: row.defaultValue, currency }}
                onChange={(m) => onChange({ defaultValue: m?.amount ?? null })}
                currency={currency}
                symbol={symbol}
              />
            )}
            {message('defaultValue')}
          </div>
          {service && (
            <label className="flex items-start gap-3 text-sm sm:col-span-2">
              <Switch
                checked={row.automatic}
                onCheckedChange={(automatic) => onChange({ automatic })}
                aria-label={t('charges.automatic')}
              />
              <span>
                <span className="font-medium">{t('charges.automatic')}</span>
                <span className="block text-muted-foreground">{t('charges.automaticHint')}</span>
              </span>
            </label>
          )}
        </fieldset>
      </CardContent>
    </Card>
  );
}
