import type { ReturnCondition } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  NumberInput,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@rbp/ui';
import { formatDate, formatMoney } from '@rbp/utils';
import { PackageIcon, Undo2Icon } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  useCreateReturn,
  useInvoices,
  useShop,
  useShops,
  useWholesaleProducts,
  useWholesaleRoutes,
} from '../api/queries';

const CONDITIONS: ReturnCondition[] = ['GOOD', 'DAMAGED', 'EXPIRED', 'WASTAGE'];
const NO_INVOICE = 'none';

interface Row {
  productId: string;
  name: string;
  /** Most that can come back (invoice) or null (no invoice). */
  max: number | null;
  unitCredit: number;
}

/**
 * WHO-005 new return (§26): shop → optional invoice → items with their condition → credit →
 * employee PIN + reason. Good stock goes back into the van; the rest is wasted.
 */
export function ReturnFormPage() {
  const { t, i18n } = useTranslation('wholesale');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const confirmSensitive = useSensitiveAction();
  const [params, setParams] = useSearchParams();
  const shopId = params.get('shop') ?? '';
  const invoiceId = params.get('invoice') ?? '';
  const ids = { shop: useId(), invoice: useId() };
  const shops = useShops();
  const shop = useShop(shopId || null);
  const invoices = useInvoices({ shopId }, !!shopId);
  const routes = useWholesaleRoutes();
  const van = routes.data?.find((r) => r.id === shop.data?.routeId)?.vanLocationId;
  const products = useWholesaleProducts(van);
  const create = useCreateReturn();
  const [qty, setQty] = useState<Record<string, number | null>>({});
  const [condition, setCondition] = useState<Record<string, ReturnCondition>>({});
  useBreadcrumbTitle(t('returnForm.title'));

  const invoice = invoices.data?.find((i) => i.id === invoiceId && i.status !== 'VOIDED');
  const returnable = invoices.data?.filter(
    (i) => i.status !== 'VOIDED' && i.lines.some((l) => l.quantity > l.returnedQuantity),
  );
  const rows: Row[] = useMemo(
    () =>
      invoice
        ? invoice.lines
            .filter((l) => l.quantity > l.returnedQuantity)
            .map((l) => ({
              productId: l.productId,
              name: l.name,
              max: l.quantity - l.returnedQuantity,
              unitCredit: l.unitPrice.amount,
            }))
        : (products.data ?? []).map((p) => ({
            productId: p.productId,
            name: p.name,
            max: null,
            unitCredit: p.price.amount,
          })),
    [invoice, products.data],
  );
  const lines = rows
    .map((r) => ({
      ...r,
      quantity: qty[r.productId] ?? 0,
      condition: condition[r.productId] ?? 'GOOD',
    }))
    .filter((l) => l.quantity > 0);
  const credit = lines.reduce((s, l) => s + l.unitCredit * l.quantity, 0);
  const tooMany = lines.some((l) => l.max !== null && l.quantity > l.max);
  const fmt = (minor: number) => formatMoney({ amount: minor, currency: 'LKR' }, locale);
  const wasted = lines.filter((l) => l.condition !== 'GOOD').reduce((s, l) => s + l.quantity, 0);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key === 'shop') next.delete('invoice');
    setParams(next, { replace: true });
    setQty({});
    setCondition({});
  };

  const submit = async () => {
    if (!shop.data || !lines.length || tooMany) return;
    const verification = await confirmSensitive('wholesale.return', {
      reasonTitle: t('returnForm.reasonTitle', { name: shop.data.name }),
      reasonDescription: t('returnForm.reasonDescription'),
      summary: `${shop.data.name} · ${lines.map((l) => `${l.name} ×${l.quantity}`).join(', ')}`,
      change: {
        before: fmt(shop.data.outstanding.amount),
        after: fmt(shop.data.outstanding.amount - credit),
      },
    });
    if (!verification) return;
    create.mutate(
      {
        shopId: shop.data.id,
        ...(invoice ? { invoiceId: invoice.id } : {}),
        lines: lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          condition: l.condition,
        })),
        verification,
      },
      {
        onSuccess: (r) => {
          toast.success(
            t('returnForm.done', { number: r.number, amount: formatMoney(r.credit, locale) }),
          );
          navigate(`/wholesale/returns/${r.id}`);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  return (
    <Screen id="WHO-005" title={t('returnForm.title')} className="space-y-section">
      <PageHeader
        eyebrow={<PageBreadcrumbs />}
        title={t('returnForm.title')}
        description={t('returnForm.hint')}
      />
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={ids.shop} className="text-sm font-medium">
              {t('fields.shop')}
            </label>
            <Select value={shopId} onValueChange={(v) => setParam('shop', v)}>
              <SelectTrigger id={ids.shop} className="w-full">
                <SelectValue placeholder={t('returnForm.pickShop')} />
              </SelectTrigger>
              <SelectContent>
                {shops.data?.items.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.invoice} className="text-sm font-medium">
              {t('returnForm.invoice')}
            </label>
            <Select
              value={invoiceId || NO_INVOICE}
              onValueChange={(v) => setParam('invoice', v === NO_INVOICE ? null : v)}
              disabled={!shopId}
            >
              <SelectTrigger id={ids.invoice} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_INVOICE}>{t('returnForm.noInvoice')}</SelectItem>
                {returnable?.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.number} · {formatDate(i.at, { locale })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!shopId ? null : shop.isError ? (
        <QueryError error={shop.error} onRetry={() => shop.refetch()} />
      ) : !shop.data || (!invoice && !products.data) ? (
        <Skeleton className="h-48" />
      ) : !rows.length ? (
        <EmptyState icon={PackageIcon} title={t('returnForm.nothing')} />
      ) : (
        <div className="grid items-start gap-section lg:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardHeader>
              <CardTitle>{t('returnForm.items')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y rounded-xl border" aria-label={t('returnForm.items')}>
                {rows.map((r) => (
                  <li
                    key={r.productId}
                    className="grid items-center gap-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_10rem]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(r.unitCredit)}
                        {r.max !== null && ` · ${t('returnForm.upTo', { count: r.max })}`}
                      </p>
                    </div>
                    <NumberInput
                      value={qty[r.productId] ?? null}
                      min={0}
                      max={r.max ?? 10000}
                      placeholder="0"
                      onChange={(v) => setQty((x) => ({ ...x, [r.productId]: v }))}
                      aria-label={t('returnForm.qtyOf', { name: r.name })}
                      decrementLabel={t('returnForm.lessOf', { name: r.name })}
                      incrementLabel={t('returnForm.moreOf', { name: r.name })}
                    />
                    <Select
                      value={condition[r.productId] ?? 'GOOD'}
                      onValueChange={(v) =>
                        setCondition((x) => ({ ...x, [r.productId]: v as ReturnCondition }))
                      }
                    >
                      <SelectTrigger
                        className="w-full"
                        aria-label={t('returnForm.conditionOf', { name: r.name })}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONDITIONS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {t(`condition.${c}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t('returnForm.credit')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm" aria-live="polite">
                <dt>{t('returnForm.creditTotal')}</dt>
                <dd className="text-right font-semibold tabular">{fmt(credit)}</dd>
                <dt>{t('sale.newBalance')}</dt>
                <dd className="text-right tabular">{fmt(shop.data.outstanding.amount - credit)}</dd>
              </dl>
              {wasted > 0 && (
                <Alert tone="info">{t('returnForm.wastedHint', { count: wasted })}</Alert>
              )}
              {tooMany && (
                <p className="text-sm text-status-danger-fg">
                  {t('common:validation.invoiceReturnTooMany')}
                </p>
              )}
              <Button
                size="pos"
                className="w-full"
                disabled={!lines.length || tooMany || create.isPending}
                loading={create.isPending}
                onClick={() => void submit()}
              >
                <Undo2Icon /> {t('returnForm.confirm')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </Screen>
  );
}
