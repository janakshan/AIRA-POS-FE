import type {
  LocationStock,
  StockLevel,
  StockMovement,
  StockMovementType,
  StockStatus,
  StockUnit,
} from '@rbp/types';
import { newId, nowIso } from '@rbp/utils';
import type { MockContext } from './context';
import { db } from './db';
import type { MockDb } from './db/seed';
import { MockHttpError } from './http';

/**
 * Stock ledger helpers (INV-*). On hand is always the sum of movements for an item at a
 * location — there is no stored quantity to drift out of step.
 */

export type MovementRecord = StockMovement & { tenantId: string };

/** REC: the dish's active recipe, if it's made to order. */
export const activeRecipe = (state: MockDb, tenantId: string, productId: string) =>
  state.recipes.find((r) => r.tenantId === tenantId && r.productId === productId && r.isActive);

export const settingKey = (productId: string, locationId: string) => `${productId}:${locationId}`;

export function onHand(state: MockDb, tenantId: string, productId: string, locationId: string) {
  let total = 0;
  for (const m of state.stockMovements) {
    if (m.tenantId === tenantId && m.productId === productId && m.locationId === locationId) {
      total += m.quantity;
    }
  }
  return total;
}

/** On hand for every (product, location) of a tenant in one pass. */
export function onHandIndex(state: MockDb, tenantId: string) {
  const qty = new Map<string, number>();
  const last = new Map<string, string>();
  for (const m of state.stockMovements) {
    if (m.tenantId !== tenantId) continue;
    const key = settingKey(m.productId, m.locationId);
    qty.set(key, (qty.get(key) ?? 0) + m.quantity);
    if ((last.get(key) ?? '') < m.at) last.set(key, m.at);
  }
  return { qty, last };
}

export const statusOf = (onHandQty: number, minStock: number): StockStatus =>
  onHandQty <= 0 ? 'OUT' : minStock > 0 && onHandQty <= minStock ? 'LOW' : 'OK';

export const unitOf = (state: MockDb, productId: string): StockUnit =>
  state.products.find((p) => p.id === productId)?.stockUnit ?? 'pcs';

export const minStockOf = (state: MockDb, productId: string, locationId: string) =>
  state.stockSettings[settingKey(productId, locationId)]?.minStock ?? 0;

/**
 * Items tracked at a location: everything sold there (location products), anything with stock
 * settings there, plus anything that ever moved there (e.g. a warehouse holding stock it doesn't sell).
 */
export function trackedPairs(state: MockDb, tenantId: string, locationIds: string[]) {
  const pairs = new Set<string>();
  // REC: a dish with an active recipe is made to order — its stock is its ingredients.
  const madeToOrder = new Set(
    state.recipes.filter((r) => r.tenantId === tenantId && r.isActive).map((r) => r.productId),
  );
  for (const r of state.locationProducts) {
    if (
      r.tenantId === tenantId &&
      r.enabled &&
      locationIds.includes(r.locationId) &&
      !madeToOrder.has(r.productId)
    ) {
      pairs.add(settingKey(r.productId, r.locationId));
    }
  }
  // Stock settings mark an item as stocked at a location before it has moved (a new ingredient).
  const tenantProducts = new Set(
    state.products.filter((p) => p.tenantId === tenantId).map((p) => p.id as string),
  );
  for (const key of Object.keys(state.stockSettings)) {
    const [productId = '', locationId = ''] = key.split(':');
    if (
      tenantProducts.has(productId) &&
      locationIds.includes(locationId) &&
      !madeToOrder.has(productId)
    ) {
      pairs.add(key);
    }
  }
  for (const m of state.stockMovements) {
    if (
      m.tenantId === tenantId &&
      locationIds.includes(m.locationId) &&
      !madeToOrder.has(m.productId)
    ) {
      pairs.add(settingKey(m.productId, m.locationId));
    }
  }
  return [...pairs].map((k) => {
    const [productId = '', locationId = ''] = k.split(':');
    return { productId, locationId };
  });
}

export function levelFor(
  state: MockDb,
  tenantId: string,
  productId: string,
  locationId: string,
  index = onHandIndex(state, tenantId),
): StockLevel | null {
  const product = state.products.find((p) => p.id === productId && p.tenantId === tenantId);
  if (!product) return null;
  const key = settingKey(productId, locationId);
  const qty = index.qty.get(key) ?? 0;
  const minStock = minStockOf(state, productId, locationId);
  return {
    productId,
    code: product.code,
    name: product.name,
    unit: product.stockUnit ?? 'pcs',
    categoryId: product.categoryId,
    locationId: locationId as StockLevel['locationId'],
    onHand: qty,
    minStock,
    status: statusOf(qty, minStock),
    lastMovementAt: index.last.get(key) ?? null,
  };
}

/** Compact stock for POS location products. */
export function locationStock(
  state: MockDb,
  tenantId: string,
  productId: string,
  locationId: string,
  index = onHandIndex(state, tenantId),
): LocationStock {
  const qty = index.qty.get(settingKey(productId, locationId)) ?? 0;
  const minStock = minStockOf(state, productId, locationId);
  return { onHand: qty, minStock, unit: unitOf(state, productId), status: statusOf(qty, minStock) };
}

export interface MovementInput {
  productId: string;
  locationId: string;
  type: StockMovementType;
  quantity: number;
  reference: StockMovement['reference'];
  reason?: StockMovement['reason'];
  approvedBy?: string;
  note?: string;
  /** Default: now. */
  at?: string;
  createdBy?: string;
}

/** Append one movement. Nothing can take stock below zero except sales already paid for. */
export function postMovement(ctx: MockContext, input: MovementInput): StockMovement {
  const state = db.get();
  const tenantId = ctx.me.tenant.id;
  const before = onHand(state, tenantId, input.productId, input.locationId);
  const after = before + input.quantity;
  if (after < 0 && input.type !== 'SALE') {
    throw new MockHttpError('CONFLICT', 409, 'Not enough stock', {
      reason: 'INSUFFICIENT_STOCK',
      productId: input.productId,
      onHand: before,
    });
  }
  const product = state.products.find((p) => p.id === input.productId);
  const movement: MovementRecord = {
    id: newId('stm'),
    tenantId,
    productId: input.productId,
    productName: product?.name ?? input.productId,
    productCode: product?.code ?? '',
    unit: product?.stockUnit ?? 'pcs',
    locationId: input.locationId as StockMovement['locationId'],
    type: input.type,
    quantity: input.quantity,
    balanceAfter: after,
    reference: input.reference,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.approvedBy ? { approvedBy: input.approvedBy } : {}),
    ...(input.note ? { note: input.note } : {}),
    createdBy: input.createdBy ?? ctx.me.user.displayName,
    at: input.at ?? nowIso(),
  };
  db.update((d) => {
    d.stockMovements.push(movement);
  });
  const { tenantId: _t, ...pub } = movement;
  return pub;
}

/**
 * Block selling more than is on hand (your rule: at 0 it can't be sold, no override).
 * Lines for the same product are summed.
 */
export function assertInStock(
  ctx: MockContext,
  locationId: string,
  lines: { productId: string; quantity: number; name?: string }[],
) {
  const state = db.get();
  const wanted = new Map<string, number>();
  for (const l of lines) wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.quantity);
  const short = [...wanted.entries()]
    .map(([productId, quantity]) => ({
      productId,
      quantity,
      onHand: onHand(state, ctx.me.tenant.id, productId, locationId),
      name: state.products.find((p) => p.id === productId)?.name ?? productId,
    }))
    .filter((x) => x.quantity > 0 && x.quantity > x.onHand);
  if (short.length) {
    throw new MockHttpError(
      'CONFLICT',
      409,
      `Not enough stock: ${short.map((s) => `${s.name} (${Math.max(s.onHand, 0)} left)`).join(', ')}`,
      {
        reason: 'OUT_OF_STOCK',
        items: short.map(({ productId, name, onHand: qty }) => ({
          productId,
          name,
          onHand: Math.max(qty, 0),
        })),
      },
    );
  }
}

/** Next ADJ-/TRF-/PO-/GRN- (BAK PLN-/BAT-, WHO WIN-/COL-/WRN-) number for the tenant. */
export function nextInventoryNumber(
  ctx: MockContext,
  prefix: 'ADJ' | 'TRF' | 'PO' | 'GRN' | 'PLN' | 'BAT' | 'WIN' | 'COL' | 'WRN' | 'SML' | 'SFT',
) {
  const key = `${prefix}:${ctx.me.tenant.id}`;
  const next = (db.get().orderSequences[key] ?? 0) + 1;
  db.update((d) => {
    d.orderSequences[key] = next;
  });
  return `${prefix}-${String(next).padStart(6, '0')}`;
}
