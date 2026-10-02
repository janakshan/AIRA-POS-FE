import {
  Button,
  CartLine,
  ConfirmDialog,
  EmptyState,
  PosActionBar,
  QuantityStepper,
  StatusBadge,
  TotalsBreakdown,
  TotalsPanel,
  toast,
  type TotalsRow,
} from '@rbp/ui';
import { cn, formatMoney } from '@rbp/utils';
import {
  ChefHatIcon,
  DoorOpenIcon,
  Grid3x3Icon,
  LockKeyholeIcon,
  MessageSquareTextIcon,
  PrinterIcon,
  PauseIcon,
  PercentIcon,
  ReceiptTextIcon,
  TagIcon,
  ScanBarcodeIcon,
  Trash2Icon,
  UtensilsIcon,
  XIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localeFor } from '@/app/i18n';
import { useErrorMessage } from '@/components/use-error-message';
import { useMe } from '@/features/auth/api/queries';
import { useSensitiveAction } from '@/features/auth/hooks/use-sensitive-action';
import { useAccess } from '@/features/auth/hooks/use-access';
import { useMediaQuery } from '@/lib/use-media-query';
import { useSessionStore } from '@/stores/session-store';
import { useLocalizedName } from '@/features/catalog/lib/localized-name';
import { useOpenDrawer, usePosSettings } from '../api/queries';
import type { CartView } from '../hooks/use-cart';
import { useRemoveAdjustment } from '../hooks/use-remove-adjustment';
import type { useSaleActions } from '../hooks/use-sale-actions';
import { CustomerButton } from './customer-button';
import { OrderTypeBar } from './order-type-bar';

const pct = (bps: number) => `${bps / 100}%`;

export interface CartPanelProps {
  cart: CartView;
  onEditQuantity: (lineId: string) => void;
  onOpenCustomer: () => void;
  /** POS-004: null = whole bill, else the item's productId. */
  onOpenDiscount: (productId: string | null) => void;
  /** POS-005 */
  onOpenCharges: () => void;
  /** Change one line's price (REQ-224). */
  onChangePrice: (lineId: string) => void;
  /** Server-backed sale actions (guarded reductions, cancel). */
  sale: ReturnType<typeof useSaleActions>;
  onPay: () => void;
  onHold: () => void;
  /** HR-005 §22: record the cart as a staff meal (no payment, stock still moves). */
  onStaffMeal: () => void;
  /** Restaurant (P3): table picker, transfer, delivery details, item notes, table bill. */
  onChooseTable: () => void;
  onTransfer: () => void;
  onEditDelivery: () => void;
  onEditNote: (lineId: string) => void;
  onBill: () => void;
  /** Heading level id for the sheet/aside label. */
  headingId: string;
  /** In the mobile sheet the header leaves room for the sheet's own close (×) button. */
  inSheet?: boolean;
}

/** POS-001 cart: lines with quantity controls, and totals that never scroll away. */
export function CartPanel({
  cart,
  onEditQuantity,
  onOpenCustomer,
  onOpenDiscount,
  onOpenCharges,
  onChangePrice,
  sale,
  onPay,
  onHold,
  onStaffMeal,
  onChooseTable,
  onTransfer,
  onEditDelivery,
  onEditNote,
  onBill,
  headingId,
  inSheet = false,
}: CartPanelProps) {
  const { t, i18n } = useTranslation('pos');
  const locale = localeFor(i18n.language);
  const nameOf = useLocalizedName();
  const settings = usePosSettings();
  const { data: me } = useMe();
  const confirmSensitive = useSensitiveAction();
  const drawer = useOpenDrawer();
  const errorMessage = useErrorMessage();
  const { hasFeature } = useAccess();
  const kitchen = cart.restaurant && hasFeature('KOT');
  const busy = sale.saving || sale.restaurantBusy;

  /** Outside a sale the drawer needs a PIN + reason and is audited (POS-006/007). */
  const openDrawer = async () => {
    const verification = await confirmSensitive('pos.drawer.open', {
      reasonTitle: t('drawer.reasonTitle'),
      reasonDescription: t('drawer.reasonDescription'),
      summary: t('drawer.summary', { location: me?.currentLocation?.name ?? '' }),
    });
    if (!verification) return;
    drawer.mutate(
      { verification },
      {
        onSuccess: () =>
          toast.success(
            t('drawer.opened', {
              name: useSessionStore.getState().lastVerification?.employee.fullName ?? '',
            }),
          ),
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  };

  const [confirmClear, setConfirmClear] = useState(false);
  // Short screens (1366×768 / 1024×768 counters): the customer and the breakdown scroll with the
  // lines so the list isn't squeezed to one row; Total, actions and Pay stay put.
  const short = useMediaQuery('(max-height: 860px)');
  const listRef = useRef<HTMLUListElement>(null);

  // Bring the line just added/changed into view and flash it briefly (no re-render needed).
  useEffect(() => {
    if (!cart.lastTouchedId) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-line-id="${cart.lastTouchedId}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
    el?.animate?.(
      [
        { backgroundColor: 'color-mix(in oklch, var(--status-success) 18%, transparent)' },
        { backgroundColor: 'transparent' },
      ],
      { duration: 700, easing: 'ease-out' },
    );
  }, [cart.lastTouchedId, cart.lines]);

  const totals = cart.totals;
  const { remove, pending: removing } = useRemoveAdjustment(cart);
  const removeButton = (adjustmentId: string, label: string) => {
    const adjustment = cart.adjustments.find((a) => a.id === adjustmentId);
    if (!adjustment) return undefined;
    return (
      <Button
        variant="ghost"
        size="icon"
        className="size-8 pointer-coarse:size-11"
        disabled={removing}
        onClick={() => void remove(adjustment)}
        aria-label={t(adjustment.kind === 'CHARGE' ? 'charge.remove' : 'discount.remove', {
          label,
        })}
      >
        <XIcon />
      </Button>
    );
  };
  const serviceOverride = cart.adjustments.find((a) => a.chargeCode === 'SERVICE');

  const rows: TotalsRow[] = totals
    ? [
        { id: 'subtotal', label: t('subtotal'), amount: totals.subtotal },
        ...(totals.lineDiscounts.amount > 0
          ? [
              {
                id: 'item-discounts',
                label: t('discount.itemDiscounts'),
                amount: totals.lineDiscounts,
                kind: 'discount' as const,
              },
            ]
          : []),
        ...totals.billDiscounts.map((d) => ({
          id: d.id,
          label: d.label,
          amount: d.amount,
          kind: 'discount' as const,
          action: removeButton(d.id, d.label),
        })),
        ...((settings.data && settings.data.serviceChargeBps > 0) || serviceOverride
          ? [
              {
                id: 'service',
                label:
                  totals.serviceChargeBps === 0
                    ? t('charge.serviceWaived')
                    : t('serviceCharge', { rate: pct(totals.serviceChargeBps) }),
                amount: totals.serviceCharge,
                kind: 'charge' as const,
                ...(serviceOverride
                  ? { action: removeButton(serviceOverride.id, serviceOverride.label) }
                  : {}),
              },
            ]
          : []),
        ...totals.charges.map((c) => ({
          id: c.id,
          label: c.label,
          amount: c.amount,
          kind: 'charge' as const,
          action: removeButton(c.id, c.label),
        })),
        ...(settings.data && totals.tax.amount > 0
          ? [
              {
                id: 'tax',
                label: t('tax', {
                  label: settings.data.taxLabel,
                  rate: pct(settings.data.taxRateBps),
                }),
                amount: totals.tax,
                kind: 'charge' as const,
              },
            ]
          : []),
      ]
    : [];

  const customer = (
    <div className="border-b px-3 py-2">
      <CustomerButton
        customer={cart.customer}
        onOpen={onOpenCustomer}
        onRemove={() => cart.setCustomer(null)}
      />
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn(
          'flex items-center justify-between gap-2 border-b px-3 py-2',
          inSheet && 'pr-16',
        )}
      >
        <h2 id={headingId} className="text-base font-semibold">
          {cart.order ? t('orderNumber', { number: cart.order.number }) : t('sale')}
          {cart.table && <span className="ml-1.5">· {cart.table.name}</span>}
          {cart.lines.length > 0 && (
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {t('items', { count: totals?.itemCount ?? 0 })}
            </span>
          )}
        </h2>
        <Button
          variant="ghost"
          disabled={cart.lines.length === 0 && !cart.order}
          // A saved order is cancelled with PIN + reason; a draft just needs a confirm.
          onClick={() => (cart.order ? void sale.cancelSale() : setConfirmClear(true))}
        >
          <Trash2Icon /> {cart.order ? t('cancelSale.action') : t('clear')}
        </Button>
      </div>
      {cart.restaurant && (
        <div className="border-b px-3 py-2">
          <OrderTypeBar
            cart={cart}
            onChooseTable={onChooseTable}
            onTransfer={onTransfer}
            onEditDelivery={onEditDelivery}
          />
        </div>
      )}
      {!short && customer}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {short && customer}
        {cart.lines.length === 0 ? (
          <EmptyState
            className="flex-1"
            icon={ScanBarcodeIcon}
            title={t('emptyTitle')}
            description={t('emptyHint')}
          />
        ) : (
          <ul
            ref={listRef}
            className={short ? undefined : 'min-h-0 flex-1 overflow-y-auto'}
            aria-labelledby={headingId}
          >
            {cart.lines.map((line) => {
              const name = nameOf(line.product ?? line.snapshot);
              return (
                <CartLine
                  key={line.lineId}
                  data-line-id={line.lineId}
                  name={name}
                  quantity={line.quantity}
                  unitPrice={line.unitPrice}
                  lineTotal={line.netTotal}
                  note={
                    line.priceOverride ||
                    line.netTotal.amount !== line.lineTotal.amount ||
                    line.note ? (
                      <span className="flex flex-wrap gap-x-2">
                        {line.note && (
                          <span className="flex items-center gap-1 text-foreground italic">
                            <MessageSquareTextIcon className="size-3" aria-hidden />
                            {line.note}
                          </span>
                        )}
                        {line.priceOverride && (
                          <s className="tabular">@ {formatMoney(line.catalogPrice, locale)}</s>
                        )}
                        {line.netTotal.amount !== line.lineTotal.amount && (
                          <s className="tabular">{formatMoney(line.lineTotal, locale)}</s>
                        )}
                      </span>
                    ) : undefined
                  }
                  locale={locale}
                  selected={cart.selectedId === line.lineId}
                  onSelect={() => cart.select(cart.selectedId === line.lineId ? null : line.lineId)}
                  voided={!line.product}
                  badges={
                    !line.product ? (
                      <StatusBadge tone="danger" size="sm">
                        {t('notSold')}
                      </StatusBadge>
                    ) : line.overStock ? (
                      <StatusBadge tone="danger" size="sm">
                        {line.available <= 0
                          ? t('stock.outBadge')
                          : t('stock.onlyBadge', { count: line.available })}
                      </StatusBadge>
                    ) : !line.sellable ? (
                      <StatusBadge tone="warning" size="sm">
                        {t('unavailable')}
                      </StatusBadge>
                    ) : line.priceChanged ||
                      line.priceOverride ||
                      line.discounts.length > 0 ||
                      kitchen ||
                      cart.order?.saved[line.productId] ? (
                      <>
                        {kitchen &&
                          line.routed &&
                          (line.sent >= line.quantity ? (
                            <StatusBadge tone="success" size="sm">
                              {t('kitchen.sentBadge')}
                            </StatusBadge>
                          ) : (
                            <StatusBadge tone="warning" size="sm">
                              {line.sent > 0
                                ? t('kitchen.newBadge', { count: line.quantity - line.sent })
                                : t('kitchen.notSent')}
                            </StatusBadge>
                          ))}
                        {cart.order?.saved[line.productId] && (
                          <StatusBadge tone="info" size="sm">
                            {t('hold.saved')}
                          </StatusBadge>
                        )}
                        {line.priceOverride && (
                          <StatusBadge tone="warning" size="sm">
                            {t('price.badge')}
                          </StatusBadge>
                        )}
                        {line.priceChanged && (
                          <StatusBadge tone="info" size="sm">
                            {t('priceChanged')}
                          </StatusBadge>
                        )}
                        {line.discounts.map((d) => (
                          <StatusBadge key={d.id} tone="success" size="sm" hideIcon>
                            −
                            {d.mode === 'PERCENT'
                              ? `${d.value / 100}%`
                              : formatMoney(
                                  { amount: d.value, currency: line.unitPrice.currency },
                                  locale,
                                )}{' '}
                            · {d.label}
                          </StatusBadge>
                        ))}
                      </>
                    ) : undefined
                  }
                  actions={
                    <>
                      <QuantityStepper
                        value={line.quantity}
                        onChange={(q) => void sale.setQuantity(line.lineId, q)}
                        onRemove={() => void sale.remove(line.lineId)}
                        label={name}
                        decrementLabel={t('decrease', { name })}
                        incrementLabel={t('increase', { name })}
                        removeLabel={t('remove', { name })}
                      />
                      <Button
                        size="pos"
                        variant="ghost"
                        className="ml-auto px-4 text-destructive"
                        onClick={() => void sale.remove(line.lineId)}
                        aria-label={t('remove', { name })}
                      >
                        <Trash2Icon />
                      </Button>
                      <div
                        className={
                          cart.restaurant
                            ? 'grid w-full grid-cols-4 gap-2'
                            : 'grid w-full grid-cols-3 gap-2'
                        }
                      >
                        <Button
                          size="pos"
                          variant="outline"
                          className="flex-col gap-0.5 px-1 text-xs"
                          onClick={() => onEditQuantity(line.lineId)}
                          aria-label={t('quantityFor', { name })}
                        >
                          <Grid3x3Icon /> {t('qtyShort')}
                        </Button>
                        <Button
                          size="pos"
                          variant="outline"
                          className="flex-col gap-0.5 px-1 text-xs"
                          onClick={() => onOpenDiscount(line.productId)}
                          aria-label={t('discount.lineButton', { name })}
                        >
                          <PercentIcon /> {t('actions.discount')}
                        </Button>
                        <Button
                          size="pos"
                          variant="outline"
                          className="flex-col gap-0.5 px-1 text-xs"
                          onClick={() => onChangePrice(line.lineId)}
                          aria-label={t('price.button', { name })}
                        >
                          <TagIcon /> {t('price.short')}
                        </Button>
                        {cart.restaurant && (
                          <Button
                            size="pos"
                            variant="outline"
                            className="flex-col gap-0.5 px-1 text-xs"
                            onClick={() => onEditNote(line.lineId)}
                            aria-label={t('note.button', { name })}
                          >
                            <MessageSquareTextIcon /> {t('note.short')}
                          </Button>
                        )}
                      </div>
                      {line.priceOverride && (
                        <Button
                          variant="link"
                          className="h-auto px-0"
                          disabled={removing}
                          onClick={() => line.priceOverride && void remove(line.priceOverride)}
                        >
                          {t('price.restore')}
                        </Button>
                      )}
                    </>
                  }
                />
              );
            })}
          </ul>
        )}
        {short && totals && rows.length > 0 && (
          <TotalsBreakdown rows={rows} locale={locale} className="border-t px-3 py-2" />
        )}
      </div>

      <div className="space-y-3 border-t bg-card p-3">
        {totals && (
          <TotalsPanel
            rows={short ? [] : rows}
            totalLabel={t('total')}
            total={totals.total}
            locale={locale}
            meta={t('items', { count: totals.itemCount })}
          />
        )}
        {cart.lines.length > 0 && !cart.payable && (
          <p className="text-sm text-status-warning-fg" role="status">
            {cart.missing
              ? t(`orderType.missing.${cart.missing}`)
              : cart.lines.some((l) => l.overStock)
                ? t('stock.cannotPay')
                : t('cannotPay')}
          </p>
        )}
        {kitchen && (
          <div className={cart.orderType === 'DINE_IN' ? 'grid grid-cols-3 gap-1.5' : 'grid'}>
            <Button
              size="pos"
              variant={cart.unsent > 0 ? 'default' : 'outline'}
              // In the 3-up dine-in row the label may wrap ("Send 12 to kitchen" at 1366px).
              className={
                cart.orderType === 'DINE_IN'
                  ? 'gap-1 px-1 text-xs leading-tight whitespace-normal'
                  : ''
              }
              disabled={cart.unsent === 0 || !cart.payable || busy}
              onClick={() => void sale.sendToKitchen()}
            >
              <ChefHatIcon />
              {cart.unsent > 0 ? t('kitchen.send', { count: cart.unsent }) : t('kitchen.allSent')}
            </Button>
            {cart.orderType === 'DINE_IN' && (
              <>
                <Button
                  size="pos"
                  variant="outline"
                  className="px-1 text-xs"
                  disabled={!cart.payable || busy}
                  onClick={onBill}
                >
                  <PrinterIcon /> {t('kitchen.bill')}
                </Button>
                <Button
                  size="pos"
                  variant="outline"
                  className="px-1 text-xs"
                  disabled={!cart.payable || busy}
                  onClick={() => void sale.leaveTable()}
                >
                  <DoorOpenIcon /> {t('tables.leave')}
                </Button>
              </>
            )}
          </div>
        )}
        <PosActionBar
          className={
            hasFeature('HR')
              ? 'grid-cols-5 gap-1 sm:grid-cols-5 xl:grid-cols-5 [&>button]:px-0.5 [&>button]:text-xs'
              : 'grid-cols-4 gap-1.5 sm:grid-cols-4 xl:grid-cols-4 [&>button]:px-1 [&>button]:text-xs'
          }
          protectedLabel={t('actions.requiresPin')}
          protectedBadge={t('actions.pin')}
          actions={[
            {
              id: 'discount',
              label: t('actions.discount'),
              icon: <PercentIcon />,
              onClick: () => onOpenDiscount(null),
              disabled: cart.lines.length === 0,
              protected: true,
            },
            {
              id: 'charges',
              label: t('actions.charges'),
              icon: <ReceiptTextIcon />,
              onClick: onOpenCharges,
              disabled: cart.lines.length === 0,
              protected: true,
            },
            {
              id: 'hold',
              label: t('hold.action'),
              icon: <PauseIcon />,
              onClick: onHold,
              disabled: cart.lines.length === 0 || !cart.payable,
            },
            ...(hasFeature('HR')
              ? [
                  {
                    id: 'staffMeal',
                    label: t('staffMeal.action'),
                    icon: <UtensilsIcon />,
                    onClick: onStaffMeal,
                    // A fresh sale only: saved orders are paid or cancelled as they are.
                    disabled: cart.lines.length === 0 || !cart.payable || !!cart.order,
                    protected: true,
                  },
                ]
              : []),
            {
              id: 'drawer',
              label: t('common:pos.openDrawer'),
              icon: <LockKeyholeIcon />,
              onClick: () => void openDrawer(),
              protected: true,
            },
          ]}
        />
        <Button
          size={short ? 'pos' : 'pos-lg'}
          className="w-full"
          disabled={!cart.payable || !totals}
          onClick={onPay}
        >
          {t('pay', { amount: totals ? formatMoney(totals.total, locale) : '' })}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('clearTitle')}
        description={t('clearDescription', { count: totals?.itemCount ?? 0 })}
        confirmLabel={t('clear')}
        cancelLabel={t('common:actions.cancel')}
        destructive
        onConfirm={() => {
          void sale.cancelSale().then(() => setConfirmClear(false));
        }}
      />
    </div>
  );
}
