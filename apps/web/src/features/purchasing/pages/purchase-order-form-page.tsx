import type { Money, PurchaseOrder, StockUnit } from '@rbp/types';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  FormSkeleton,
  Input,
  MoneyInput,
  MoneyText,
  NumberInput,
  PageHeader,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@rbp/ui';
import { PackageIcon, PlusIcon, SendIcon, Trash2Icon } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { localeFor } from '@/app/i18n';
import { QueryError } from '@/components/query-error';
import { Screen } from '@/components/screen';
import { useUnsavedChangesGuard } from '@/components/unsaved-changes-guard';
import { useMe } from '@/features/auth/api/queries';
import { useInventory } from '@/features/inventory/api/queries';
import { ItemPicker } from '@/features/inventory/components/item-picker';
import { LocationSelect } from '@/features/inventory/components/location-select';
import { useMyLocations } from '@/features/inventory/lib/use-locations';
import { useBreadcrumbTitle } from '@/navigation/breadcrumb-store';
import { PageBreadcrumbs } from '@/navigation/page-breadcrumbs';
import {
  usePurchaseOrder,
  usePurchaseOrders,
  useSavePurchaseOrder,
  useSupplier,
  useSuppliers,
} from '../api/queries';
import { usePurchasingErrorMessage } from '../lib/use-purchasing-error';

interface Line {
  productId: string;
  name: string;
  code: string;
  unit: StockUnit;
  /** On hand at the deliver-to location when picked (null after the location changes). */
  onHand: number | null;
  quantity: number | null;
  unitCost: Money | null;
}

/** PUR-003 new / edit (draft) purchase order: supplier, deliver-to, items with agreed cost. */
export function PurchaseOrderFormPage() {
  const { id } = useParams();
  const { t } = useTranslation('purchasing');
  const order = usePurchaseOrder(id);
  if (id && (order.isPending || order.error)) {
    return (
      <Shell title={t('orderForm.editTitle')}>
        {order.error ? (
          <QueryError error={order.error} onRetry={() => order.refetch()} />
        ) : (
          <Card className="p-6">
            <FormSkeleton fields={5} />
          </Card>
        )}
      </Shell>
    );
  }
  if (order.data && order.data.status !== 'DRAFT') {
    return (
      <Shell title={order.data.number}>
        <Alert tone="info" title={t('orderForm.notDraft', { number: order.data.number })}>
          <Link
            to={`/purchasing/orders/${order.data.id}`}
            className="inline-flex items-center font-medium underline pointer-coarse:min-h-11"
          >
            {t('orderForm.openOrder')}
          </Link>
        </Alert>
      </Shell>
    );
  }
  return <OrderForm key={id ?? 'new'} order={order.data} />;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  useBreadcrumbTitle(title);
  return (
    <Screen id="PUR-003" title={title} className="space-y-section">
      <PageHeader eyebrow={<PageBreadcrumbs />} title={title} />
      {children}
    </Screen>
  );
}

function OrderForm({ order }: { order: PurchaseOrder | undefined }) {
  const { t, i18n } = useTranslation('purchasing');
  const locale = localeFor(i18n.language);
  const navigate = useNavigate();
  const errorMessage = usePurchasingErrorMessage();
  const [params] = useSearchParams();
  const { data: me } = useMe();
  const currency = me?.tenant.currency ?? 'LKR';
  const { current } = useMyLocations();
  const suppliers = useSuppliers({ active: true, pageSize: 100 });
  // Recent orders suggest the last agreed cost per item.
  const recent = usePurchaseOrders({ pageSize: 100 });
  const save = useSavePurchaseOrder();
  const ids = { supplier: useId(), location: useId(), date: useId(), note: useId() };

  const [supplierId, setSupplierId] = useState(order?.supplierId ?? params.get('supplierId') ?? '');
  const [locationId, setLocationId] = useState(
    order?.locationId ?? params.get('location') ?? current?.id ?? '',
  );
  const [expectedDate, setExpectedDate] = useState(order?.expectedDate ?? '');
  const [note, setNote] = useState(order?.note ?? '');
  const [lines, setLines] = useState<Line[]>(
    (order?.lines ?? []).map((l) => ({
      productId: l.productId,
      name: l.productName,
      code: l.productCode,
      unit: l.unit,
      onHand: null,
      quantity: l.quantity,
      unitCost: l.unitCost,
    })),
  );
  // REC-004 / REC-001 "Create purchase order": ?lines=productId:qty,… (new orders only).
  const [prefill, setPrefill] = useState(() =>
    order
      ? []
      : (params.get('lines') ?? '')
          .split(',')
          .map((x) => x.split(':'))
          .filter(([id, qty]) => id && Number(qty) > 0)
          .map(([id, qty]) => ({ productId: id ?? '', quantity: Number(qty) })),
  );
  const [picking, setPicking] = useState(!order && prefill.length === 0);
  const [dirty, setDirty] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const guard = useUnsavedChangesGuard(dirty && !save.isPending);
  const touch = () => setDirty(true);

  const lastCost = useMemo(() => {
    const map = new Map<string, Money>();
    // Newest first: keep the first cost seen per item.
    for (const po of recent.data?.items ?? []) {
      if (po.status === 'CANCELLED') continue;
      for (const l of po.lines) if (!map.has(l.productId)) map.set(l.productId, l.unitCost);
    }
    return map;
  }, [recent.data]);

  const stock = useInventory({ locationId, pageSize: 100 }, prefill.length > 0 && !!locationId);
  if (prefill.length && stock.data && recent.data) {
    const levels = new Map(stock.data.items.map((l) => [l.productId, l]));
    setLines(
      prefill.flatMap((p) => {
        const level = levels.get(p.productId);
        return level
          ? [
              {
                productId: level.productId,
                name: level.name,
                code: level.code,
                unit: level.unit,
                onHand: level.onHand,
                quantity: p.quantity,
                unitCost: lastCost.get(level.productId) ?? null,
              },
            ]
          : [];
      }),
    );
    setPrefill([]);
    setDirty(true);
  }

  const setLine = (productId: string, patch: Partial<Line>) => {
    touch();
    setLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  };
  const total = lines.reduce((s, l) => s + (l.quantity ?? 0) * (l.unitCost?.amount ?? 0), 0);
  // Only active suppliers are listed: one from ?supplierId= or an older draft may since have been
  // deactivated. Don't preselect it (the server refuses the order) — say why instead.
  const unlisted =
    !!supplierId && !!suppliers.data && !suppliers.data.items.some((s) => s.id === supplierId);
  const inactive = useSupplier(unlisted ? supplierId : null).data;
  const supplierMissing = !supplierId || unlisted;
  const linesInvalid =
    lines.length === 0 || lines.some((l) => !l.quantity || l.quantity < 1 || !l.unitCost);
  const back = order ? `/purchasing/orders/${order.id}` : '/purchasing/orders';

  const submit = (place: boolean) => {
    setSubmitted(true);
    if (supplierMissing || !locationId || linesInvalid) return;
    save.mutate(
      {
        ...(order ? { id: order.id } : {}),
        body: {
          supplierId,
          locationId,
          ...(expectedDate ? { expectedDate } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity ?? 0,
            unitCost: l.unitCost?.amount ?? 0,
          })),
          place,
        },
      },
      {
        onSuccess: (po) => {
          guard.bypass();
          toast.success(
            t(place ? 'orderForm.placed' : 'orderForm.saved', {
              number: po.number,
              supplier: po.supplierName,
            }),
          );
          navigate(`/purchasing/orders/${po.id}`);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const selected = suppliers.data?.items.find((s) => s.id === supplierId);

  return (
    <Shell
      title={order ? t('orderForm.editNumber', { number: order.number }) : t('orderForm.newTitle')}
    >
      {guard.dialog}
      <div className="grid items-start gap-section xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-section">
          <Card>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor={ids.supplier} className="text-sm font-medium">
                  {t('fields.supplier')} <span className="text-destructive">*</span>
                </label>
                <Select
                  value={unlisted ? '' : supplierId}
                  onValueChange={(v) => {
                    touch();
                    setSupplierId(v);
                  }}
                >
                  <SelectTrigger
                    id={ids.supplier}
                    aria-invalid={(submitted && supplierMissing) || !!inactive}
                    className="w-full"
                  >
                    <SelectValue placeholder={t('orderForm.chooseSupplier')} />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.data?.items.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {inactive && !inactive.isActive ? (
                  <p role="alert" className="text-sm text-destructive">
                    {t('orderForm.supplierInactive', { name: inactive.name })}{' '}
                    <Link
                      to={`/purchasing/suppliers/${inactive.id}`}
                      className="font-medium underline"
                    >
                      {t('orderForm.openSupplier')}
                    </Link>
                  </p>
                ) : submitted && supplierMissing ? (
                  <p role="alert" className="text-sm text-destructive">
                    {t('common:validation.supplierRequired')}
                  </p>
                ) : (
                  selected && (
                    <p className="text-xs text-muted-foreground">
                      {selected.paymentTermsDays === 0
                        ? t('supplier.cod')
                        : t('supplier.termsDays', { count: selected.paymentTermsDays })}
                      {selected.contactName ? ` · ${selected.contactName}` : ''}
                    </p>
                  )
                )}
              </div>
              <div className="space-y-1.5">
                <label htmlFor={ids.location} className="text-sm font-medium">
                  {t('fields.deliverTo')}
                </label>
                <LocationSelect
                  id={ids.location}
                  value={locationId}
                  onChange={(v) => {
                    touch();
                    setLocationId(v);
                    // On-hand figures were for the old location.
                    setLines((ls) => ls.map((l) => ({ ...l, onHand: null })));
                  }}
                  label={t('fields.deliverTo')}
                  className="w-full"
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={ids.date} className="text-sm font-medium">
                  {t('fields.expected')}
                </label>
                <Input
                  id={ids.date}
                  type="date"
                  value={expectedDate}
                  onChange={(e) => {
                    touch();
                    setExpectedDate(e.target.value);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={ids.note} className="text-sm font-medium">
                  {t('fields.note')}
                </label>
                <Input
                  id={ids.note}
                  maxLength={200}
                  value={note}
                  placeholder={t('orderForm.notePlaceholder')}
                  onChange={(e) => {
                    touch();
                    setNote(e.target.value);
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('orderForm.items')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {lines.length > 0 ? (
                <ul className="divide-y rounded-xl border" aria-label={t('orderForm.items')}>
                  {lines.map((l) => (
                    <li
                      key={l.productId}
                      className="grid items-center gap-3 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_10rem_8rem_auto]"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{l.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{l.code}</span>
                          {l.onHand !== null &&
                            ` · ${t('orderForm.onHand', {
                              count: l.onHand,
                              unit: t(`inventory:unit.${l.unit}`, { count: l.onHand }),
                            })}`}
                        </p>
                      </div>
                      <NumberInput
                        value={l.quantity}
                        min={1}
                        max={100000}
                        onChange={(q) => setLine(l.productId, { quantity: q })}
                        aria-label={t('orderForm.quantityFor', { name: l.name })}
                        aria-invalid={submitted && (!l.quantity || l.quantity < 1)}
                        decrementLabel={t('orderForm.less', { name: l.name })}
                        incrementLabel={t('orderForm.more', { name: l.name })}
                      />
                      <MoneyInput
                        value={l.unitCost}
                        currency={currency}
                        symbol="Rs."
                        onChange={(v) => setLine(l.productId, { unitCost: v })}
                        aria-label={t('orderForm.costFor', { name: l.name })}
                        aria-invalid={submitted && !l.unitCost}
                      />
                      <MoneyText
                        value={{
                          amount: (l.quantity ?? 0) * (l.unitCost?.amount ?? 0),
                          currency,
                        }}
                        locale={locale}
                        className="text-right font-medium"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-touch justify-self-end text-destructive"
                        onClick={() => {
                          touch();
                          setLines((ls) => ls.filter((x) => x.productId !== l.productId));
                        }}
                        aria-label={t('orderForm.removeLine', { name: l.name })}
                      >
                        <Trash2Icon />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                !picking && <EmptyState icon={PackageIcon} title={t('orderForm.noItems')} />
              )}
              {submitted && linesInvalid && (
                <p role="alert" className="text-sm text-destructive">
                  {lines.length === 0
                    ? t('common:validation.purchaseOrderEmpty')
                    : t('orderForm.linesInvalid')}
                </p>
              )}

              {picking && locationId ? (
                <div className="space-y-2">
                  <ItemPicker
                    locationId={locationId}
                    disabledIds={lines.map((l) => l.productId)}
                    onPick={(level) => {
                      touch();
                      setLines((ls) => [
                        ...ls,
                        {
                          productId: level.productId,
                          name: level.name,
                          code: level.code,
                          unit: level.unit,
                          onHand: level.onHand,
                          quantity: Math.max(1, level.minStock * 2 - level.onHand),
                          unitCost: lastCost.get(level.productId) ?? null,
                        },
                      ]);
                      setPicking(false);
                    }}
                  />
                  {lines.length > 0 && (
                    <Button variant="ghost" onClick={() => setPicking(false)}>
                      {t('orderForm.donePicking')}
                    </Button>
                  )}
                </div>
              ) : (
                <Button variant="outline" onClick={() => setPicking(true)} disabled={!locationId}>
                  <PlusIcon /> {t('orderForm.addItem')}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="xl:sticky xl:top-4">
          <CardHeader>
            <CardTitle>{t('orderForm.summary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('orderForm.lineCount')}</dt>
                <dd className="tabular">{lines.length}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{t('orderForm.unitCount')}</dt>
                <dd className="tabular">{lines.reduce((s, l) => s + (l.quantity ?? 0), 0)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-t pt-2 text-base font-semibold">
                <dt>{t('fields.total')}</dt>
                <dd>
                  <MoneyText value={{ amount: total, currency }} locale={locale} />
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">{t('orderForm.costHint')}</p>
            <div className="flex flex-col gap-2">
              <Button
                size="pos"
                loading={save.isPending && save.variables?.body.place === true}
                disabled={save.isPending}
                onClick={() => submit(true)}
              >
                <SendIcon /> {t('orderForm.saveAndPlace')}
              </Button>
              <Button
                variant="outline"
                loading={save.isPending && save.variables?.body.place === false}
                disabled={save.isPending}
                onClick={() => submit(false)}
              >
                {t('orderForm.saveDraft')}
              </Button>
              <Button variant="ghost" onClick={() => navigate(back)}>
                {t('cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Shell>
  );
}
