import type { AuditEvent, Money, PriceChange, PriceMatrixRow } from '@rbp/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FilterBar,
  MoneyInput,
  PageHeader,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
  toDecimalString,
} from '@rbp/ui';
import { cn, formatDateTime, formatMoney } from '@rbp/utils';
import { ArrowDownIcon, SearchXIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { ListSearch } from '@/components/list-search';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useErrorMessage } from '@/components/use-error-message';
import { useAuditEvents } from '@/features/audit/api/queries';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useIsMobile } from '@/lib/use-media-query';
import { useListParams } from '@/lib/use-list-params';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import { useCategoryTree, usePriceMatrix, useUpdatePrices } from '../api/queries';
import { CategorySelect } from '../components/category-select';
import { useTenantCurrency } from '../lib/currency';

const PAGE_SIZE = 20;
const BASE = 'base';
const cellKey = (productId: string, locationId: string | null) =>
  `${productId}|${locationId ?? BASE}`;

interface Draft {
  row: PriceMatrixRow;
  locationId: string | null;
  price: Money | null;
}

/** Effective selling price before/after a draft change, as the server compares them. */
function lowers(d: Draft) {
  if (d.locationId === null) return !!d.price && d.price.amount < d.row.basePrice.amount;
  const before = d.row.prices[d.locationId] ?? d.row.basePrice;
  const after = d.price ?? d.row.basePrice;
  return after.amount < before.amount;
}

/** CAT-006 Pricing: base price + per-location prices in one grid. Price cuts need a manager PIN. */
export function PricingPage() {
  const { t, i18n } = useTranslation('catalog');
  const locale = localeFor(i18n.language);
  const { currency, symbol } = useTenantCurrency();
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const { can } = useAccess();
  const isMobile = useIsMobile();
  const list = useListParams({ pageSize: PAGE_SIZE, filterKeys: ['category'] });
  const tree = useCategoryTree();
  const matrix = usePriceMatrix({
    page: list.page,
    pageSize: PAGE_SIZE,
    ...(list.search ? { search: list.search } : {}),
    ...(list.filters.category ? { categoryId: list.filters.category } : {}),
  });
  const updatePrices = useUpdatePrices();
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [mobileLocation, setMobileLocation] = useState<string | null>(null);

  const locations = matrix.data?.locations ?? [];
  const shownLocations = isMobile
    ? locations.filter((l) => l.id === (mobileLocation ?? locations[0]?.id))
    : locations;

  const setDraft = (row: PriceMatrixRow, locationId: string | null, price: Money | null) =>
    setDrafts((prev) => {
      const next = new Map(prev);
      const original = locationId === null ? row.basePrice : row.prices[locationId];
      const same =
        (original?.amount ?? null) === (price?.amount ?? null) ||
        (locationId === null && price === null);
      if (same) next.delete(cellKey(row.productId, locationId));
      else next.set(cellKey(row.productId, locationId), { row, locationId, price });
      return next;
    });

  const save = async () => {
    const changes: PriceChange[] = [...drafts.values()].map((d) => ({
      productId: d.row.productId,
      locationId: d.locationId,
      price: d.price,
    }));
    let verification;
    if ([...drafts.values()].some(lowers)) {
      verification = await confirmSensitive('pos.price.override', {
        reasonTitle: t('pricing.reasonTitle'),
        reasonDescription: t('pricing.reasonDescription'),
        summary: t('pricing.changes', { count: drafts.size }),
      });
      if (!verification) return;
    }
    updatePrices.mutate(
      { changes, ...(verification ? { verification } : {}) },
      {
        onSuccess: ({ updated }) => {
          setDrafts(new Map());
          toast.success(t('pricing.saved', { count: updated }));
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const guard = useUnsavedChangesGuard(drafts.size > 0 && !updatePrices.isPending);

  return (
    <Screen id="CAT-006" title={t('nav:items.pricing')} className="space-y-section">
      {guard.dialog}
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('nav:items.pricing')}
        description={t('pricing.hint')}
      />
      <div className="grid items-start gap-section 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0 gap-0 p-0">
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
                  <CategorySelect
                    tree={tree.data}
                    value={list.filters.category ?? null}
                    onChange={(v) => list.setFilter('category', v)}
                    placeholder={t('products.allCategories')}
                    noneLabel={t('products.allCategories')}
                    inactiveLabel={t('common.inactive')}
                    aria-label={t('common.category')}
                    className="w-full sm:w-56"
                  />
                  {isMobile && locations.length > 1 && (
                    <Select
                      value={mobileLocation ?? locations[0]?.id ?? ''}
                      onValueChange={setMobileLocation}
                    >
                      <SelectTrigger className="w-full" aria-label={t('pricing.showLocation')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </>
              }
            />
          </div>
          {matrix.isError ? (
            <QueryError error={matrix.error} onRetry={() => matrix.refetch()} />
          ) : matrix.isPending ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : matrix.data.items.length === 0 ? (
            <EmptyState
              icon={SearchXIcon}
              title={t('common.noResultsTitle')}
              description={t('common.noResultsHint')}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <caption className="sr-only">{t('pricing.caption')}</caption>
                <thead>
                  <tr className="border-b bg-muted/40 text-left">
                    <th scope="col" className="sticky left-0 z-10 bg-muted px-4 py-2 font-semibold">
                      {t('pricing.product')}
                    </th>
                    <th scope="col" className="px-3 py-2 font-semibold">
                      {t('pricing.base')}
                    </th>
                    {shownLocations.map((l) => (
                      <th key={l.id} scope="col" className="px-3 py-2 font-semibold">
                        {l.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.data.items.map((row) => (
                    <tr key={row.productId} className="border-b last:border-0">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 max-w-56 bg-card px-4 py-2 text-left font-normal"
                      >
                        <span className="block truncate font-medium">{row.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
                      </th>
                      <PriceCell
                        label={`${row.name} · ${t('pricing.base')}`}
                        original={row.basePrice}
                        draft={drafts.get(cellKey(row.productId, null))}
                        onChange={(price) => setDraft(row, null, price)}
                        currency={currency}
                        symbol={symbol}
                        required
                      />
                      {shownLocations.map((l) => (
                        <PriceCell
                          key={l.id}
                          label={`${row.name} · ${l.name}`}
                          original={row.prices[l.id] ?? null}
                          fallback={row.basePrice}
                          draft={drafts.get(cellKey(row.productId, l.id))}
                          onChange={(price) => setDraft(row, l.id, price)}
                          currency={currency}
                          symbol={symbol}
                          hint={row.enabled[l.id] ? undefined : t('pricing.notSold')}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {matrix.data && matrix.data.total > PAGE_SIZE && (
            <div className="border-t p-4">
              <Pagination
                page={list.page}
                pageSize={PAGE_SIZE}
                total={matrix.data.total}
                onPageChange={list.setPage}
                summary={(from, to, total) => t('common.summary', { from, to, total })}
                previousLabel={t('common.previous')}
                nextLabel={t('common.next')}
                pageLabel={(p) => t('common.page', { page: p })}
              />
            </div>
          )}
        </Card>
        {can('report.audit.view') && <RecentPriceChanges locale={locale} />}
      </div>

      {drafts.size > 0 && (
        <div
          role="region"
          aria-label={t('pricing.changes', { count: drafts.size })}
          className="sticky bottom-0 z-30 -mx-page border-t bg-background/95 px-page py-3 shadow-lg backdrop-blur"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium" aria-live="polite">
              {t('pricing.changes', { count: drafts.size })}
              {[...drafts.values()].some(lowers) && (
                <span className="ml-2 inline-flex items-center gap-1 text-status-warning-fg">
                  <ArrowDownIcon className="size-4" aria-hidden /> {t('pricing.lowered')}
                </span>
              )}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setDrafts(new Map())}
                disabled={updatePrices.isPending}
              >
                {t('common.discard')}
              </Button>
              <Button onClick={() => void save()} loading={updatePrices.isPending}>
                {t('pricing.save')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Screen>
  );
}

function PriceCell({
  label,
  original,
  fallback,
  draft,
  onChange,
  currency,
  symbol,
  required,
  hint,
}: {
  label: string;
  original: Money | null;
  /** Shown as placeholder when there's no override. */
  fallback?: Money;
  draft: Draft | undefined;
  onChange: (price: Money | null) => void;
  currency: Money['currency'];
  symbol: string;
  required?: boolean;
  hint?: string | undefined;
}) {
  const value = draft ? draft.price : original;
  const changed = !!draft;
  const down = draft ? lowers(draft) : false;
  return (
    <td className="px-3 py-2 align-top">
      <MoneyInput
        currency={currency}
        symbol={symbol}
        value={value}
        onChange={onChange}
        aria-label={label}
        aria-required={required}
        placeholder={fallback ? toDecimalString(fallback) : undefined}
        className={cn(
          'w-36',
          changed && 'bg-status-warning/10 ring-2 ring-status-warning/50',
          down && 'ring-status-danger/60',
        )}
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </td>
  );
}

function RecentPriceChanges({ locale }: { locale: string }) {
  const { t } = useTranslation('catalog');
  const events = useAuditEvents({ action: 'catalog.price.change', pageSize: 6 });
  const describe = (e: AuditEvent) => {
    const fmt = (v: unknown) =>
      v && typeof v === 'object' && 'amount' in v
        ? formatMoney(v as Money, locale)
        : t('pricing.usesBase');
    return `${fmt(e.before)} → ${fmt(e.after)}`;
  };
  const items = useMemo(() => events.data?.items ?? [], [events.data]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('pricing.recent')}</CardTitle>
      </CardHeader>
      <CardContent>
        {events.isPending ? (
          <Skeleton className="h-24" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('pricing.recentEmpty')}</p>
        ) : (
          <ul className="space-y-3 text-sm">
            {items.map((e) => (
              <li key={e.id} className="space-y-0.5">
                <p className="font-medium">{e.entityLabel}</p>
                <p className="tabular">{describe(e)}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(e.at, { locale })} · {t('pricing.by', { name: e.userName })}
                  {e.employee && ` · ${t('pricing.confirmedBy', { name: e.employee.fullName })}`}
                  {e.reason &&
                    ` · ${e.reason.label}${e.reason.comment ? ` (${e.reason.comment})` : ''}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
