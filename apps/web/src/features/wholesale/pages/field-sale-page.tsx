import type { Money, WholesalePaymentMethod, WholesaleShop } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  MoneyInput,
  MoneyText,
  NumberInput,
  PageHeader,
  PaymentMethodButton,
  SearchInput,
  Skeleton,
  StatusBadge,
  toast,
} from '@rbp/ui';
import { cn, formatMoney } from '@rbp/utils';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  FileTextIcon,
  PackageIcon,
  StoreIcon,
  TruckIcon,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useCreateInvoice,
  useInvoices,
  useShop,
  useShops,
  useWholesaleProducts,
  useWholesaleRoutes,
} from '../api/queries';
import { METHODS } from '../lib/methods';
import { CreditBar } from '../components/credit-bar';
import { useCanSell } from '../hooks/use-can-sell';
import { InvoiceTable } from '../components/invoice-table';
import { localDay } from '../lib/format';

type Step = 'items' | 'review';

/**
 * WHO-003 Field sale (FLOW-WHO-001), phone first: shop → products from the van → review
 * (paid now / on credit, limit warning) → invoice → print / share.
 */
export function FieldSalePage() {
  const { t } = useTranslation('wholesale');
  const [params, setParams] = useSearchParams();
  const shopId = params.get('shop');
  const shop = useShop(shopId);
  const canSell = useCanSell();

  return (
    <Screen id="WHO-003" title={t('sale.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={shop.data ? t('sale.titleFor', { name: shop.data.name }) : t('sale.title')}
        description={t('sale.hint')}
      />
      {canSell.known && !canSell.any ? (
        <NoVan />
      ) : !shopId ? (
        <ShopPicker onPick={(id) => setParams({ shop: id })} />
      ) : shop.isError ? (
        <QueryError error={shop.error} onRetry={() => shop.refetch()} />
      ) : !shop.data ? (
        <Skeleton className="h-64" />
      ) : (
        <SaleForm key={shop.data.id} shop={shop.data} onChangeShop={() => setParams({})} />
      )}
    </Screen>
  );
}

/** Selling needs a van (the server refuses otherwise): explain instead of a raw FORBIDDEN. */
function NoVan() {
  const { t } = useTranslation('wholesale');
  return <EmptyState icon={TruckIcon} title={t('sale.noVan')} description={t('sale.noVanHint')} />;
}

/** Step 1: today's route first, then everyone else. */
function ShopPicker({ onPick }: { onPick: (id: string) => void }) {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const [search, setSearch] = useState('');
  const routes = useWholesaleRoutes();
  const shops = useShops(search.trim() ? { search: search.trim() } : {});
  const today = useInvoices({ date: localDay() });
  const weekday = new Date().getDay();
  const todays = new Set(routes.data?.filter((r) => r.days.includes(weekday)).map((r) => r.id));
  const active = shops.data?.items.filter((s) => s.isActive) ?? [];
  const groups = [
    { key: 'today', items: active.filter((s) => s.routeId && todays.has(s.routeId)) },
    { key: 'others', items: active.filter((s) => !s.routeId || !todays.has(s.routeId)) },
  ].filter((g) => g.items.length);

  return (
    <>
      <section className="space-y-3" aria-labelledby="pick-shop">
        <h2 id="pick-shop" className="text-lg font-semibold">
          {t('sale.pickShop')}
        </h2>
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder={t('shops.searchPlaceholder')}
          aria-label={t('shops.search')}
        />
        {shops.isError ? (
          <QueryError error={shops.error} onRetry={() => shops.refetch()} />
        ) : !shops.data ? (
          <Skeleton className="h-40" />
        ) : !groups.length ? (
          <EmptyState icon={StoreIcon} title={t('shops.noResults')} />
        ) : (
          groups.map((g) => (
            <div key={g.key} className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                {t(`sale.group.${g.key}`)}
              </p>
              <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onPick(s.id)}
                      className="flex w-full flex-col gap-1 rounded-xl border bg-card p-3 text-left focus-ring hover:bg-accent"
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{s.name}</span>
                        {s.overLimit ? (
                          <StatusBadge tone="danger" size="sm">
                            {t('shops.overLimit')}
                          </StatusBadge>
                        ) : s.overdue.amount > 0 ? (
                          <StatusBadge tone="warning" size="sm">
                            {t('shops.overdue')}
                          </StatusBadge>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {[s.area, s.routeId ? t('shops.stop', { n: s.stopOrder }) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="text-sm">
                        {t('sale.owes')}{' '}
                        <MoneyText
                          value={s.outstanding}
                          locale={locale}
                          className="font-semibold"
                        />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
      <section className="space-y-3" aria-labelledby="today-invoices">
        <h2 id="today-invoices" className="text-lg font-semibold">
          {t('sale.today')}
        </h2>
        <Card className="p-0">
          <InvoiceTable
            caption={t('sale.today')}
            rows={today.data}
            loading={today.isPending}
            empty={<EmptyState icon={FileTextIcon} title={t('sale.noneToday')} />}
          />
        </Card>
      </section>
    </>
  );
}

function SaleForm({ shop, onChangeShop }: { shop: WholesaleShop; onChangeShop: () => void }) {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const routes = useWholesaleRoutes();
  const van = routes.data?.find((r) => r.id === shop.routeId)?.vanLocationId;
  const canSell = useCanSell().from(van);
  const products = useWholesaleProducts(van, canSell);
  const create = useCreateInvoice();
  const paidId = useId();
  const [step, setStep] = useState<Step>('items');
  const [qty, setQty] = useState<Record<string, number | null>>({});
  const [paid, setPaid] = useState<Money | null>(null);
  const [method, setMethod] = useState<WholesalePaymentMethod>('CASH');
  const [accepted, setAccepted] = useState(false);
  const fmt = (minor: number) => formatMoney({ amount: minor, currency: 'LKR' }, locale);

  const lines = useMemo(
    () =>
      (products.data ?? [])
        .map((p) => ({ ...p, quantity: qty[p.productId] ?? 0 }))
        .filter((p) => p.quantity > 0),
    [products.data, qty],
  );
  const total = lines.reduce((s, l) => s + l.price.amount * l.quantity, 0);
  const tooMany = lines.some((l) => l.quantity > l.onHand);
  const paidNow = Math.min(paid?.amount ?? 0, total);
  const credit = total - paidNow;
  const after = shop.outstanding.amount + credit;
  const overLimit = credit > 0 && shop.creditLimit.amount > 0 && after > shop.creditLimit.amount;
  const canCreate =
    lines.length > 0 && !tooMany && (paid?.amount ?? 0) <= total && (!overLimit || accepted);

  const submit = () =>
    create.mutate(
      {
        shopId: shop.id,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        paidNow,
        ...(paidNow ? { method } : {}),
      },
      {
        onSuccess: (inv) => {
          toast.success(t('sale.done', { number: inv.number }));
          navigate(`/wholesale/field-sales/${inv.id}`);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <div className="space-y-section">
      <Card className="flex flex-row flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{shop.name}</p>
          <p className="text-sm text-muted-foreground">
            {t('sale.owes')} <MoneyText value={shop.outstanding} locale={locale} />
          </p>
          <CreditBar
            outstanding={shop.outstanding}
            limit={shop.creditLimit}
            className="mt-1 max-w-sm"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="pointer-coarse:min-h-11"
          onClick={onChangeShop}
        >
          {t('sale.changeShop')}
        </Button>
      </Card>

      {step === 'items' ? (
        <section className="space-y-3" aria-labelledby="sale-items">
          <h2 id="sale-items" className="text-lg font-semibold">
            {t('sale.items')}
          </h2>
          {!canSell ? (
            <NoVan />
          ) : products.isError ? (
            <QueryError error={products.error} onRetry={() => products.refetch()} />
          ) : !products.data ? (
            <Skeleton className="h-64" />
          ) : !products.data.length ? (
            <EmptyState icon={PackageIcon} title={t('sale.noProducts')} />
          ) : (
            <ul className="divide-y rounded-xl border bg-card" aria-label={t('sale.items')}>
              {products.data.map((p) => {
                const q = qty[p.productId] ?? 0;
                return (
                  <li
                    key={p.productId}
                    className="grid items-center gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_10rem]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <MoneyText value={p.price} locale={locale} /> ·{' '}
                        <span className={cn(p.onHand === 0 && 'text-status-danger-fg')}>
                          {t('sale.inVan', { count: p.onHand })}
                        </span>
                      </p>
                      {q > p.onHand && (
                        <p className="text-xs font-medium text-status-danger-fg">
                          {t('sale.notEnough')}
                        </p>
                      )}
                    </div>
                    <NumberInput
                      value={qty[p.productId] ?? null}
                      min={0}
                      max={p.onHand}
                      placeholder="0"
                      disabled={p.onHand === 0}
                      onChange={(v) => setQty((x) => ({ ...x, [p.productId]: v }))}
                      aria-label={t('sale.qtyOf', { name: p.name })}
                      decrementLabel={t('sale.lessOf', { name: p.name })}
                      incrementLabel={t('sale.moreOf', { name: p.name })}
                    />
                  </li>
                );
              })}
            </ul>
          )}
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm">
            <p className="text-sm" aria-live="polite">
              {t('sale.summary', { count: lines.reduce((s, l) => s + l.quantity, 0) })}{' '}
              <span className="font-semibold">{fmt(total)}</span>
            </p>
            <Button
              size="pos"
              disabled={!lines.length || tooMany}
              onClick={() => setStep('review')}
            >
              {t('sale.review')} <ArrowRightIcon />
            </Button>
          </div>
        </section>
      ) : (
        <section
          className="grid items-start gap-section lg:grid-cols-2"
          aria-label={t('sale.reviewTitle')}
        >
          <Card>
            <CardHeader>
              <CardTitle>{t('sale.reviewTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y text-sm">
                {lines.map((l) => (
                  <li key={l.productId} className="flex justify-between gap-2 py-2">
                    <span>
                      {l.name}
                      <span className="block text-xs text-muted-foreground">
                        {l.quantity} × {formatMoney(l.price, locale)}
                      </span>
                    </span>
                    <span className="font-medium tabular">{fmt(l.price.amount * l.quantity)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between border-t pt-3 text-base font-semibold">
                <span>{t('invoice.total')}</span>
                <span className="tabular">{fmt(total)}</span>
              </p>
              <p className="text-xs text-muted-foreground">{t('sale.vatIncluded')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('sale.payment')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor={paidId} className="text-sm font-medium">
                  {t('sale.paidNow')}
                </label>
                <MoneyInput
                  id={paidId}
                  value={paid}
                  onChange={setPaid}
                  currency="LKR"
                  symbol="Rs"
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="pointer-coarse:min-h-11"
                    onClick={() => setPaid({ amount: total, currency: 'LKR' })}
                  >
                    {t('sale.paidInFull')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="pointer-coarse:min-h-11"
                    onClick={() => setPaid(null)}
                  >
                    {t('sale.allOnCredit')}
                  </Button>
                </div>
                {(paid?.amount ?? 0) > total && (
                  <p className="text-sm text-status-danger-fg">
                    {t('common:validation.paidTooMuch')}
                  </p>
                )}
              </div>
              {paidNow > 0 && (
                <fieldset>
                  <legend className="mb-2 text-sm font-medium">{t('fields.method')}</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {METHODS.map(({ method: m, icon }) => (
                      <PaymentMethodButton
                        key={m}
                        icon={icon}
                        label={t(`method.${m}`)}
                        selected={method === m}
                        onClick={() => setMethod(m)}
                      />
                    ))}
                  </div>
                </fieldset>
              )}
              <dl
                className="grid grid-cols-[1fr_auto] gap-y-1 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                aria-live="polite"
              >
                <dt>{t('invoice.onCredit')}</dt>
                <dd className="text-right font-semibold tabular">{fmt(credit)}</dd>
                <dt>{t('sale.newBalance')}</dt>
                <dd className="text-right font-semibold tabular">{fmt(after)}</dd>
                <dt className="text-muted-foreground">{t('fields.creditLimit')}</dt>
                <dd className="text-right text-muted-foreground tabular">
                  {shop.creditLimit.amount ? fmt(shop.creditLimit.amount) : t('credit.noLimit')}
                </dd>
              </dl>
              {overLimit && (
                <Alert tone="warning" title={t('sale.overLimitTitle')}>
                  <p>{t('sale.overLimitHint', { amount: fmt(after - shop.creditLimit.amount) })}</p>
                  <label className="mt-2 flex items-center gap-2 font-medium">
                    <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(v === true)} />
                    {t('sale.overLimitAccept')}
                  </label>
                </Alert>
              )}
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="outline" size="pos" onClick={() => setStep('items')}>
                  <ArrowLeftIcon /> {t('sale.back')}
                </Button>
                <Button
                  size="pos"
                  disabled={!canCreate}
                  loading={create.isPending}
                  onClick={submit}
                >
                  <FileTextIcon /> {t('sale.create')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
