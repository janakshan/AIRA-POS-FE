import type { LocationProduct, Money, Order, OrderType, SaleAdjustment } from '@rbp/types';
import { computeTotals, multiplyMoney, type SaleTotals, type TotalsAdjustment } from '@rbp/utils';
import { useCallback, useMemo } from 'react';
import { useMe } from '@/features/auth/api/queries';
import { useLocationProducts } from '@/features/catalog/api/queries';
import { sellableQty } from '@/features/catalog/lib/stock';
import { usePosSettings } from '../api/queries';
import { isRestaurantPos } from '../lib/pos-mode';
import {
  type DraftCustomer,
  type DraftDelivery,
  type DraftLine,
  type DraftTable,
  type DraftOrderRef,
  EMPTY_CART,
  useCartStore,
} from '../store/cart-store';

export interface CartLineView extends DraftLine {
  /** Live location product; undefined if it's no longer sold here. */
  product: LocationProduct | undefined;
  unitPrice: Money;
  /** Location price before any POS price change. */
  catalogPrice: Money;
  /** Approved POS price change on this line (REQ-224). */
  priceOverride: SaleAdjustment | undefined;
  /** Gross (price × qty). */
  lineTotal: Money;
  /** After item + share of bill discounts. */
  netTotal: Money;
  /** Item-level discounts on this line. */
  discounts: SaleAdjustment[];
  /** Can be charged now (sold here and available). */
  sellable: boolean;
  priceChanged: boolean;
  /** Units already sent to the kitchen (P3). */
  sent: number;
  /**
   * Has a kitchen station here, so it goes out on a KOT. Other items (a bun from the counter,
   * a bottled drink) never wait on the kitchen: they don't count as unsent or need a disposition.
   */
  routed: boolean;
  /** INV: units that can be sold here (Infinity when not tracked). */
  available: number;
  /** More on the line than is in stock. */
  overStock: boolean;
}

export interface CartView {
  key: string | null;
  lines: CartLineView[];
  customer: DraftCustomer | null;
  /** Saved order this draft continues, if any (POS-010). */
  order: DraftOrderRef | null;
  /** Approved discounts/charges on the sale. */
  adjustments: SaleAdjustment[];
  /** Restaurant location with the restaurant POS on: order types, tables, kitchen (P3). */
  restaurant: boolean;
  orderType: OrderType;
  table: DraftTable | null;
  delivery: DraftDelivery | null;
  /** Units of routed items not yet sent to the kitchen (what the next KOTs will hold). */
  unsent: number;
  /** Why the sale can't be saved yet (dine-in without table, delivery without address). */
  missing: 'table' | 'delivery' | null;
  selectedId: string | null;
  lastTouchedId: string | null;
  totals: SaleTotals | null;
  /** Totals as they'd be with one more adjustment (dialog previews). */
  preview: (extra: TotalsAdjustment) => SaleTotals | null;
  /** Quantity per product, for Quick Pad badges. */
  quantities: Record<string, number>;
  /** Every line is sellable and the cart isn't empty. */
  payable: boolean;
  add: (product: LocationProduct, quantity?: number) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  remove: (lineId: string) => void;
  select: (lineId: string | null) => void;
  setCustomer: (customer: DraftCustomer | null) => void;
  setOrderType: (type: OrderType, table?: DraftTable | null) => void;
  setTable: (table: DraftTable | null) => void;
  setDelivery: (delivery: DraftDelivery | null) => void;
  setNote: (lineId: string, note: string) => void;
  linkOrder: (order: Order) => void;
  loadOrder: (order: Order) => void;
  addAdjustment: (adjustment: SaleAdjustment) => void;
  removeAdjustment: (id: string) => void;
  clear: () => void;
}

/** The current terminal's draft sale joined with live prices, availability and totals. */
export function useCart(): CartView {
  const { data: me } = useMe();
  const products = useLocationProducts();
  const settings = usePosSettings();
  const key =
    me?.tenant.id && me.currentLocation
      ? `${me.tenant.id}:${me.currentLocation.id}:${me.device?.id ?? '-'}`
      : null;
  const cart = useCartStore((s) => (key ? s.carts[key] : undefined)) ?? EMPTY_CART;
  const store = useCartStore.getState;

  const adjustments = useMemo(() => cart.adjustments ?? [], [cart.adjustments]);

  const joined = useMemo(() => {
    const byId = new Map<string, LocationProduct>(products.data?.map((p) => [p.productId, p]));
    return cart.lines.map((line) => ({ line, product: byId.get(line.productId) }));
  }, [cart.lines, products.data]);

  const calc = useCallback(
    (extra: TotalsAdjustment[]) => {
      if (!settings.data || !me) return null;
      return computeTotals(
        // Lines no longer sold here can't be charged, so they don't count.
        joined.flatMap(({ line, product }) =>
          product
            ? [
                {
                  productId: line.productId,
                  unitPrice: product.price,
                  quantity: line.quantity,
                  taxMode: product.taxMode,
                  serviceCharge: product.serviceCharge,
                },
              ]
            : [],
        ),
        settings.data,
        me.tenant.currency,
        [...adjustments, ...extra],
      );
    },
    [joined, settings.data, me, adjustments],
  );
  const totals = useMemo(() => calc([]), [calc]);

  const lines = useMemo(() => {
    const byProduct = new Map(totals?.lines.map((l) => [l.productId, l]));
    return joined.map(({ line, product }): CartLineView => {
      const computed = byProduct.get(line.productId);
      // POS price change (PRICE adjustment) wins over the catalog/location price.
      const catalogPrice = product?.price ?? line.snapshot.price;
      const unitPrice = computed?.unitPrice ?? catalogPrice;
      const lineTotal = multiplyMoney(unitPrice, line.quantity);
      return {
        ...line,
        product,
        unitPrice,
        lineTotal,
        catalogPrice,
        priceOverride: adjustments
          .filter((a) => a.kind === 'PRICE' && a.productId === line.productId)
          .at(-1),
        netTotal: computed?.net ?? lineTotal,
        discounts: adjustments.filter(
          (a) => a.kind === 'DISCOUNT' && a.scope === 'LINE' && a.productId === line.productId,
        ),
        sellable: !!product?.isAvailable && line.quantity <= sellableQty(product),
        available: sellableQty(product),
        overStock: line.quantity > sellableQty(product),
        priceChanged: !!product && product.price.amount !== line.snapshot.price.amount,
        sent: Math.min(cart.order?.saved[line.productId]?.sent ?? 0, line.quantity),
        routed: !!product?.stationId,
      };
    });
  }, [joined, totals, adjustments, cart.order]);

  const restaurant = isRestaurantPos(me);
  // Counter sales at a restaurant default to takeaway; dine-in is chosen with a table.
  const orderType: OrderType = restaurant ? (cart.orderType ?? 'TAKEAWAY') : 'RETAIL';
  const table = orderType === 'DINE_IN' ? (cart.table ?? null) : null;
  const delivery = orderType === 'DELIVERY' ? (cart.delivery ?? null) : null;
  const missing =
    orderType === 'DINE_IN' && !table
      ? 'table'
      : orderType === 'DELIVERY' && !delivery
        ? 'delivery'
        : null;

  const withKey = useCallback(
    <A extends unknown[]>(fn: (key: string, ...args: A) => void) =>
      (...args: A) => {
        if (key) fn(key, ...args);
      },
    [key],
  );

  return {
    key,
    lines,
    customer: cart.customer ?? null,
    order: cart.order ?? null,
    adjustments,
    restaurant,
    orderType,
    table,
    delivery,
    unsent: lines.reduce((s, l) => s + (l.routed ? l.quantity - l.sent : 0), 0),
    missing,
    selectedId: cart.selectedId,
    lastTouchedId: cart.lastTouchedId,
    totals,
    preview: (extra) => calc([extra]),
    quantities: Object.fromEntries(cart.lines.map((l) => [l.productId, l.quantity])),
    payable: lines.length > 0 && lines.every((l) => l.sellable) && !missing,
    add: withKey((k, p: LocationProduct, q?: number) => void store().add(k, p, q)),
    setQuantity: withKey((k, id: string, q: number) => store().setQuantity(k, id, q)),
    remove: withKey((k, id: string) => store().remove(k, id)),
    select: withKey((k, id: string | null) => store().select(k, id)),
    setCustomer: withKey((k, c: DraftCustomer | null) => store().setCustomer(k, c)),
    setOrderType: withKey((k, type: OrderType, t?: DraftTable | null) =>
      store().setOrderType(k, type, t),
    ),
    setTable: withKey((k, t: DraftTable | null) => store().setTable(k, t)),
    setDelivery: withKey((k, d: DraftDelivery | null) => store().setDelivery(k, d)),
    setNote: withKey((k, id: string, note: string) => store().setNote(k, id, note)),
    linkOrder: withKey((k, o: Order) => store().linkOrder(k, o)),
    loadOrder: withKey((k, o: Order) => store().loadOrder(k, o)),
    addAdjustment: withKey((k, a: SaleAdjustment) => store().addAdjustment(k, a)),
    removeAdjustment: withKey((k, id: string) => store().removeAdjustment(k, id)),
    clear: withKey((k) => store().clear(k)),
  };
}
