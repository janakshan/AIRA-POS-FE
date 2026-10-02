import type { KitchenStation, LocationProduct } from '@rbp/types';
import {
  Button,
  Card,
  EmptyState,
  FilterBar,
  FilterChip,
  Input,
  MoneyText,
  PageHeader,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  StatusBadge,
  Switch,
  toast,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { ChefHatIcon, SearchXIcon, Settings2Icon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { useMe } from '@/features/auth/api/queries';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useCategoryTree,
  useKitchenStations,
  useLocationProducts,
  useUpdateLocationProduct,
} from '../api/queries';
import { useLocalizedName } from '../lib/localized-name';

/** CAT-005 Location Product Setup (REQ-153…180): what each location sells and what's available now. */
export function LocationProductsPage() {
  const { t } = useTranslation('catalog');
  const { data: me } = useMe();
  const list = useListParams({ filterKeys: ['location', 'sold'] });
  const locationId = list.filters.location ?? me?.currentLocation?.id ?? '';
  const location = me?.locations.find((l) => l.id === locationId);

  const tree = useCategoryTree();
  const products = useLocationProducts({ locationId, all: true });
  const stations = useKitchenStations(locationId);

  const groups = useMemo(() => {
    const q = list.search.trim().toLowerCase();
    const rows = (products.data ?? []).filter(
      (p) =>
        (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) &&
        (!list.filters.sold || (list.filters.sold === 'yes') === p.enabled),
    );
    return (tree.data ?? [])
      .map((c) => ({ category: c, rows: rows.filter((p) => p.categoryId === c.id) }))
      .filter((g) => g.rows.length > 0);
  }, [products.data, tree.data, list.search, list.filters.sold]);

  const soldCount = products.data?.filter((p) => p.enabled).length ?? 0;
  const error = products.error ?? tree.error;

  return (
    <Screen id="CAT-005" title={t('nav:items.locationProducts')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('nav:items.locationProducts')}
        description={t('locationProducts.hint')}
        actions={
          me && me.locations.length > 1 ? (
            <Select value={locationId} onValueChange={(v) => list.setFilter('location', v)}>
              <SelectTrigger className="w-56" aria-label={t('common.location')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {me.locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : undefined
        }
      />
      <Card className="gap-0 p-0">
        <div className="border-b p-4">
          <FilterBar
            search={
              <ListSearch
                value={list.search}
                onSearch={list.setSearch}
                placeholder={t('products.searchPlaceholder')}
                aria-label={t('common.search')}
              />
            }
            filters={
              <>
                {(
                  [
                    [null, 'common.all'],
                    ['yes', 'locationProducts.filterSold'],
                    ['no', 'locationProducts.filterNotSold'],
                  ] as const
                ).map(([value, key]) => (
                  <FilterChip
                    key={key}
                    active={(list.filters.sold ?? null) === value}
                    onClick={() => list.setFilter('sold', value)}
                  >
                    {t(key)}
                  </FilterChip>
                ))}
              </>
            }
            actions={
              products.data && (
                <span className="self-center text-sm text-muted-foreground" aria-live="polite">
                  {t('locationProducts.summary', {
                    sold: soldCount,
                    total: products.data.length,
                  })}
                </span>
              )
            }
          />
        </div>
        {error ? (
          <QueryError
            error={error}
            onRetry={() => {
              void products.refetch();
              void tree.refetch();
            }}
          />
        ) : products.isPending || tree.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={SearchXIcon}
            title={t('common.noResultsTitle')}
            description={t('common.noResultsHint')}
          />
        ) : (
          <div aria-label={t('locationProducts.caption', { location: location?.name ?? '' })}>
            {groups.map(({ category, rows }) => (
              <section key={category.id} aria-labelledby={`lp-${category.id}`}>
                <h2
                  id={`lp-${category.id}`}
                  className="sticky top-0 z-10 flex items-center gap-2 border-b bg-muted/60 px-4 py-2 text-sm font-semibold backdrop-blur"
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: category.color }}
                  />
                  {[...category.path, category.name].join(' › ')}
                </h2>
                <ul className="divide-y">
                  {rows.map((p) => (
                    <LocationProductRow
                      key={p.productId}
                      product={p}
                      locationId={locationId}
                      locationName={location?.name ?? ''}
                      stations={stations.data ?? []}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
    </Screen>
  );
}

function LocationProductRow({
  product,
  locationId,
  locationName,
  stations,
}: {
  product: LocationProduct;
  locationId: string;
  locationName: string;
  stations: KitchenStation[];
}) {
  const { t, i18n } = useTranslation('catalog');
  const locale = localeFor(i18n.language);
  const errorMessage = useErrorMessage();
  const update = useUpdateLocationProduct(locationId);
  const nameOf = useLocalizedName();
  const [note, setNote] = useState(product.stockNote ?? '');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const station = stations.find((s) => s.id === product.stationId);

  const save = (body: Parameters<typeof update.mutate>[0]['body'], success?: string) =>
    update.mutate(
      { productId: product.productId, body },
      {
        onSuccess: () => success && toast.success(success),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  const saveNote = () => {
    if (note.trim() === (product.stockNote ?? '')) return;
    save({ stockNote: note.trim() || null }, t('locationProducts.noteSaved'));
  };

  return (
    <li
      className={cn(
        'grid items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]',
        'lg:grid-cols-[minmax(0,1fr)_8rem_7rem_7rem_12rem_auto]',
        !product.enabled && 'bg-muted/30',
      )}
    >
      <div className="min-w-0">
        <p className={cn('truncate font-medium', !product.enabled && 'text-muted-foreground')}>
          {nameOf(product)}
        </p>
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span className="font-mono">{product.code}</span>
          {product.enabled && station && (
            <StatusBadge tone="neutral" size="sm" hideIcon>
              <ChefHatIcon aria-hidden /> {station.name}
            </StatusBadge>
          )}
          {product.enabled && product.serviceCharge && (
            <StatusBadge tone="neutral" size="sm" hideIcon>
              {t('locationProducts.serviceChargeBadge')}
            </StatusBadge>
          )}
        </p>
      </div>
      <div className="flex items-center gap-2 lg:justify-end">
        <MoneyText value={product.price} locale={locale} className="text-sm font-semibold" />
        {product.priceOverride && (
          <StatusBadge tone="info" size="sm" hideIcon>
            {t('locationProducts.override')}
          </StatusBadge>
        )}
      </div>
      <label className="flex min-h-touch items-center gap-2 text-sm">
        <Switch
          checked={product.enabled}
          onCheckedChange={(enabled) =>
            save(
              { enabled },
              t(enabled ? 'locationProducts.enabledToast' : 'locationProducts.disabledToast', {
                name: product.name,
                location: locationName,
              }),
            )
          }
          aria-label={`${t('locationProducts.soldHere')}: ${product.name}`}
        />
        <span aria-hidden>{t('locationProducts.soldHere')}</span>
      </label>
      <label className="flex min-h-touch items-center gap-2 text-sm">
        <Switch
          checked={product.isAvailable}
          disabled={!product.enabled}
          onCheckedChange={(isAvailable) => save({ isAvailable })}
          aria-label={`${t('locationProducts.available')}: ${product.name}`}
        />
        <span aria-hidden>{t('locationProducts.available')}</span>
      </label>
      <Input
        value={note}
        disabled={!product.enabled}
        onChange={(e) => setNote(e.target.value)}
        onBlur={saveNote}
        onKeyDown={(e) => e.key === 'Enter' && saveNote()}
        placeholder={t('locationProducts.stockNotePlaceholder')}
        aria-label={`${t('locationProducts.stockNote')}: ${product.name}`}
        maxLength={40}
      />
      <Button
        variant="outline"
        size="icon"
        disabled={!product.enabled}
        onClick={() => setSettingsOpen(true)}
        aria-label={t('locationProducts.settingsFor', { name: product.name })}
      >
        <Settings2Icon />
      </Button>
      <ResponsiveDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        title={t('locationProducts.settingsFor', { name: nameOf(product) })}
        description={t('locationProducts.settingsHint', { location: locationName })}
        closeLabel={t('common.cancel')}
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor={`station-${product.productId}`}>
              {t('locationProducts.station')}
            </label>
            <Select
              value={product.stationId ?? 'none'}
              onValueChange={(v) =>
                save({ stationId: v === 'none' ? null : v }, t('locationProducts.settingsSaved'))
              }
            >
              <SelectTrigger id={`station-${product.productId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('locationProducts.noStation')}</SelectItem>
                {stations.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} · {s.printerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">{t('locationProducts.stationHint')}</p>
          </div>
          <label className="flex min-h-touch items-start justify-between gap-4 rounded-lg border p-3">
            <span className="space-y-0.5">
              <span className="block text-sm font-medium">
                {t('locationProducts.serviceCharge')}
              </span>
              <span className="block text-sm text-muted-foreground">
                {t('locationProducts.serviceChargeHint')}
              </span>
            </span>
            <Switch
              checked={product.serviceCharge}
              onCheckedChange={(serviceCharge) =>
                save({ serviceCharge }, t('locationProducts.settingsSaved'))
              }
            />
          </label>
        </div>
      </ResponsiveDialog>
    </li>
  );
}
