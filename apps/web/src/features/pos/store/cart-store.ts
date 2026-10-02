import type {
  LocationProduct,
  Money,
  NameTranslations,
  Order,
  OrderType,
  SaleAdjustment,
} from '@rbp/types';
import { newId } from '@rbp/utils';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJsonStorage } from '@/lib/storage';

/**
 * POS-001 draft sale, kept on the device until the order is created at Pay/Hold.
 * Keyed by tenant:location:device so carts never mix across locations or terminals.
 */
export interface DraftLine {
  lineId: string;
  productId: string;
  quantity: number;
  addedAt: number;
  /** Special instructions for the kitchen (REQ-343). */
  note?: string;
  /** Shown if the product is later switched off here; live price is used while it's sold. */
  snapshot: { name: string; nameTranslations: NameTranslations; code: string; price: Money };
}

/** POS-003: optional customer on the sale (walk-in when null). */
export interface DraftCustomer {
  id: string;
  name: string;
  /** E.164. */
  phone: string | null;
}

/** The saved order this draft continues (after Hold → Resume, or a failed payment). */
export interface DraftOrderRef {
  id: string;
  number: string;
  /** Quantities saved on the server per product; reducing below them needs PIN + reason. */
  saved: Record<string, { lineId: string; quantity: number; sent: number }>;
}

/** REST-006 delivery details (status lives on the saved order). */
export interface DraftDelivery {
  address: string;
  phone: string;
  instructions?: string;
}

export interface DraftTable {
  id: string;
  name: string;
}

export interface DraftCart {
  lines: DraftLine[];
  order?: DraftOrderRef | null;
  customer?: DraftCustomer | null;
  /** Server-approved discounts/charges (POS-004/005), ACTIVE only. */
  adjustments?: SaleAdjustment[];
  /** Restaurant locations only (P3); unset = the location's default. */
  orderType?: OrderType;
  table?: DraftTable | null;
  delivery?: DraftDelivery | null;
  selectedId: string | null;
  /** Last line added or incremented (scroll + highlight). */
  lastTouchedId: string | null;
}

const orderRef = (order: Order): DraftOrderRef => ({
  id: order.id,
  number: order.number,
  saved: Object.fromEntries(
    order.lines
      .filter((l) => l.quantity > 0)
      .map((l) => [l.productId, { lineId: l.id, quantity: l.quantity, sent: l.sentQuantity }]),
  ),
});

export const EMPTY_CART: DraftCart = {
  lines: [],
  order: null,
  customer: null,
  adjustments: [],
  orderType: undefined,
  table: null,
  delivery: null,
  selectedId: null,
  lastTouchedId: null,
};
export const MAX_QUANTITY = 999;

interface CartState {
  carts: Record<string, DraftCart>;
  add: (key: string, product: LocationProduct, quantity?: number) => DraftLine;
  setQuantity: (key: string, lineId: string, quantity: number) => void;
  remove: (key: string, lineId: string) => void;
  select: (key: string, lineId: string | null) => void;
  setCustomer: (key: string, customer: DraftCustomer | null) => void;
  /** Dine-in needs a table; switching away from dine-in drops it. */
  setOrderType: (key: string, type: OrderType, table?: DraftTable | null) => void;
  setTable: (key: string, table: DraftTable | null) => void;
  setDelivery: (key: string, delivery: DraftDelivery | null) => void;
  setNote: (key: string, lineId: string, note: string) => void;
  /** Link the draft to a saved order and remember its saved quantities. */
  linkOrder: (key: string, order: Order) => void;
  /** Replace the draft with a resumed order. */
  loadOrder: (key: string, order: Order) => void;
  addAdjustment: (key: string, adjustment: SaleAdjustment) => void;
  removeAdjustment: (key: string, id: string) => void;
  clear: (key: string) => void;
}

const update = (
  carts: Record<string, DraftCart>,
  key: string,
  fn: (cart: DraftCart) => DraftCart,
): Record<string, DraftCart> => ({ ...carts, [key]: fn(carts[key] ?? EMPTY_CART) });

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      carts: {},
      add: (key, product, quantity = 1) => {
        const cart = get().carts[key] ?? EMPTY_CART;
        const existing = cart.lines.find((l) => l.productId === product.productId);
        const line: DraftLine = existing
          ? { ...existing, quantity: Math.min(existing.quantity + quantity, MAX_QUANTITY) }
          : {
              lineId: newId('ln'),
              productId: product.productId,
              quantity: Math.min(quantity, MAX_QUANTITY),
              addedAt: Date.now(),
              snapshot: {
                name: product.name,
                nameTranslations: product.nameTranslations,
                code: product.code,
                price: product.price,
              },
            };
        set((s) => ({
          carts: update(s.carts, key, (c) => ({
            ...c,
            lines: existing
              ? c.lines.map((l) => (l.lineId === line.lineId ? line : l))
              : [...c.lines, line],
            lastTouchedId: line.lineId,
          })),
        }));
        return line;
      },
      setQuantity: (key, lineId, quantity) =>
        set((s) => ({
          carts: update(s.carts, key, (c) => ({
            ...c,
            lines: c.lines.map((l) =>
              l.lineId === lineId
                ? { ...l, quantity: Math.max(1, Math.min(MAX_QUANTITY, Math.round(quantity))) }
                : l,
            ),
            lastTouchedId: lineId,
          })),
        })),
      remove: (key, lineId) =>
        set((s) => ({
          carts: update(s.carts, key, (c) => {
            const index = c.lines.findIndex((l) => l.lineId === lineId);
            const lines = c.lines.filter((l) => l.lineId !== lineId);
            const removed = c.lines.find((l) => l.lineId === lineId);
            // Keep keyboard users on a nearby line.
            const next = lines[Math.min(index, lines.length - 1)]?.lineId ?? null;
            return {
              ...c,
              lines,
              // An item discount goes with its item.
              adjustments: (c.adjustments ?? []).filter(
                (a) => !(a.scope === 'LINE' && a.productId === removed?.productId),
              ),
              selectedId: c.selectedId === lineId ? next : c.selectedId,
              lastTouchedId: null,
            };
          }),
        })),
      select: (key, lineId) =>
        set((s) => ({ carts: update(s.carts, key, (c) => ({ ...c, selectedId: lineId })) })),
      setCustomer: (key, customer) =>
        set((s) => ({ carts: update(s.carts, key, (c) => ({ ...c, customer })) })),
      setOrderType: (key, orderType, table) =>
        set((s) => ({
          carts: update(s.carts, key, (c) => ({
            ...c,
            orderType,
            table: orderType === 'DINE_IN' ? (table ?? c.table ?? null) : null,
          })),
        })),
      setTable: (key, table) =>
        set((s) => ({ carts: update(s.carts, key, (c) => ({ ...c, table })) })),
      setDelivery: (key, delivery) =>
        set((s) => ({ carts: update(s.carts, key, (c) => ({ ...c, delivery })) })),
      setNote: (key, lineId, note) =>
        set((s) => ({
          carts: update(s.carts, key, (c) => ({
            ...c,
            lines: c.lines.map((l) => {
              if (l.lineId !== lineId) return l;
              const { note: _old, ...rest } = l;
              return note.trim() ? { ...rest, note: note.trim() } : rest;
            }),
          })),
        })),
      addAdjustment: (key, adjustment) =>
        set((s) => ({
          carts: update(s.carts, key, (c) => ({
            ...c,
            // A new service-charge override replaces the previous one.
            adjustments: [
              ...(c.adjustments ?? []).filter(
                (a) => !(adjustment.chargeCode === 'SERVICE' && a.chargeCode === 'SERVICE'),
              ),
              adjustment,
            ],
          })),
        })),
      removeAdjustment: (key, id) =>
        set((s) => ({
          carts: update(s.carts, key, (c) => ({
            ...c,
            adjustments: (c.adjustments ?? []).filter((a) => a.id !== id),
          })),
        })),
      linkOrder: (key, order) =>
        set((s) => ({ carts: update(s.carts, key, (c) => ({ ...c, order: orderRef(order) })) })),
      loadOrder: (key, order) =>
        set((s) => ({
          carts: {
            ...s.carts,
            [key]: {
              ...EMPTY_CART,
              order: orderRef(order),
              customer: order.customer,
              adjustments: order.adjustments,
              orderType: order.type,
              table: order.table,
              delivery: order.delivery
                ? {
                    address: order.delivery.address,
                    phone: order.delivery.phone,
                    ...(order.delivery.instructions
                      ? { instructions: order.delivery.instructions }
                      : {}),
                  }
                : null,
              lines: order.lines
                .filter((l) => l.quantity > 0)
                .map((l) => ({
                  lineId: newId('ln'),
                  productId: l.productId,
                  quantity: l.quantity,
                  addedAt: Date.now(),
                  ...(l.note ? { note: l.note } : {}),
                  snapshot: {
                    name: l.name,
                    nameTranslations: l.nameTranslations,
                    code: l.code,
                    price: l.unitPrice,
                  },
                })),
            },
          },
        })),
      clear: (key) => set((s) => ({ carts: { ...s.carts, [key]: EMPTY_CART } })),
    }),
    { name: 'rbp.pos.carts', storage: safeJsonStorage, partialize: ({ carts }) => ({ carts }) },
  ),
);
