import type { LocationStock, PreparedItem, RecipeAvailability } from '@rbp/types';
import { newId, nowIso } from '@rbp/utils';
import type { MockContext } from './context';
import { db } from './db';
import type { MockDb, PreparedRecord, RecipeRecord } from './db/seed';
import { MockHttpError } from './http';
import { activeRecipe, assertInStock, onHandIndex, postMovement, settingKey } from './inventory';

/**
 * REC-* stock rules (prototype). A dish with an active recipe is made to order:
 * - "can make" = what its scarcest ingredient allows, plus prepared units ready to resell;
 * - paying for it uses prepared units first, then posts PRODUCTION_CONSUMPTION on each ingredient;
 * - it has no finished stock of its own.
 * Other items keep finished-stock tracking (INV-*).
 */

export const DEFAULT_SHELF_LIFE_HOURS = 4;

export const isExpired = (p: { expiresAt: string }, now = nowIso()) => p.expiresAt <= now;

/** Derived status: AVAILABLE past its time is EXPIRED. */
export const preparedStatus = (p: PreparedRecord, now = nowIso()): PreparedItem['status'] =>
  p.status === 'AVAILABLE' && isExpired(p, now) ? 'EXPIRED' : p.status;

/** Prepared units that can still be sold, oldest first. */
export function usablePrepared(
  state: MockDb,
  tenantId: string,
  productId: string,
  locationId: string,
  now = nowIso(),
) {
  return state.preparedItems
    .filter(
      (p) =>
        p.tenantId === tenantId &&
        p.productId === productId &&
        p.locationId === locationId &&
        p.status === 'AVAILABLE' &&
        p.remaining > 0 &&
        !isExpired(p, now),
    )
    .sort((a, b) => a.preparedAt.localeCompare(b.preparedAt));
}

export const preparedCount = (
  state: MockDb,
  tenantId: string,
  productId: string,
  locationId: string,
) => usablePrepared(state, tenantId, productId, locationId).reduce((s, p) => s + p.remaining, 0);

const nameOf = (state: MockDb, productId: string) =>
  state.products.find((p) => p.id === productId)?.name ?? productId;

/** How many servings the ingredients allow, and which one runs out first. */
export function availabilityOf(
  state: MockDb,
  tenantId: string,
  recipe: RecipeRecord,
  locationId: string,
  index = onHandIndex(state, tenantId),
): RecipeAvailability {
  let fromIngredients = Number.POSITIVE_INFINITY;
  let limitedBy: RecipeAvailability['limitedBy'] = null;
  for (const l of recipe.lines) {
    const have = Math.max(0, index.qty.get(settingKey(l.ingredientId, locationId)) ?? 0);
    const servings = Math.floor(have / l.quantity);
    if (servings < fromIngredients) {
      fromIngredients = servings;
      limitedBy = { ingredientId: l.ingredientId, name: nameOf(state, l.ingredientId) };
    }
  }
  if (!Number.isFinite(fromIngredients)) fromIngredients = 0;
  const prepared = preparedCount(state, tenantId, recipe.productId, locationId);
  return {
    locationId: locationId as RecipeAvailability['locationId'],
    canMake: fromIngredients + prepared,
    fromIngredients,
    prepared,
    limitedBy,
  };
}

/**
 * POS stock for a location product. Made-to-order dishes report "can make"; other items their
 * finished stock (plus any prepared units waiting, for the tile badge).
 */
export function stockForSale(
  state: MockDb,
  tenantId: string,
  productId: string,
  locationId: string,
  finished: () => LocationStock,
  index?: ReturnType<typeof onHandIndex>,
): LocationStock {
  const recipe = activeRecipe(state, tenantId, productId);
  const prepared = preparedCount(state, tenantId, productId, locationId);
  if (!recipe) return { ...finished(), ...(prepared ? { prepared } : {}) };
  const a = availabilityOf(state, tenantId, recipe, locationId, index);
  return {
    onHand: a.canMake,
    minStock: 0,
    unit: 'portion',
    status: a.canMake <= 0 ? 'OUT' : 'OK',
    madeToOrder: true,
    ...(a.prepared ? { prepared: a.prepared } : {}),
    ...(a.limitedBy ? { limitedBy: a.limitedBy.name } : {}),
  };
}

/**
 * Replaces `assertInStock` for sales: recipe lines become ingredient needs (after prepared
 * units), summed across lines — two dishes can share the same chicken.
 */
export function assertCanSell(
  ctx: MockContext,
  locationId: string,
  lines: { productId: string; quantity: number; name?: string }[],
) {
  const state = db.get();
  const tenantId = ctx.me.tenant.id;
  const plain: { productId: string; quantity: number }[] = [];
  const wanted = new Map<string, number>();
  for (const l of lines) wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.quantity);
  for (const [productId, quantity] of wanted) {
    const recipe = activeRecipe(state, tenantId, productId);
    if (!recipe) {
      plain.push({ productId, quantity });
      continue;
    }
    const toMake = Math.max(0, quantity - preparedCount(state, tenantId, productId, locationId));
    for (const r of recipe.lines) {
      if (toMake > 0) plain.push({ productId: r.ingredientId, quantity: toMake * r.quantity });
    }
  }
  assertInStock(ctx, locationId, plain);
}

/** Take up to `quantity` prepared units for an order; returns how many were used. */
function takePrepared(
  ctx: MockContext,
  productId: string,
  locationId: string,
  quantity: number,
  order: { id: string; number: string },
) {
  let left = quantity;
  const at = nowIso();
  for (const p of usablePrepared(db.get(), ctx.me.tenant.id, productId, locationId, at)) {
    if (left <= 0) break;
    const take = Math.min(left, p.remaining);
    left -= take;
    db.update((d) => {
      const rec = d.preparedItems.find((x) => x.id === p.id);
      if (!rec) return;
      rec.remaining -= take;
      rec.uses.push({ orderId: order.id, orderNumber: order.number, quantity: take, at });
      if (rec.remaining <= 0) rec.status = 'USED';
    });
  }
  return quantity - left;
}

/** Ingredients used to make `servings` of a dish. */
export function consumeIngredients(
  ctx: MockContext,
  recipe: RecipeRecord,
  servings: number,
  locationId: string,
  input: {
    type: 'PRODUCTION_CONSUMPTION' | 'WASTAGE' | 'STAFF_MEAL';
    reference: Parameters<typeof postMovement>[1]['reference'];
    note: string;
  },
) {
  if (servings <= 0) return;
  for (const l of recipe.lines) {
    postMovement(ctx, {
      productId: l.ingredientId,
      locationId,
      type: input.type,
      quantity: -l.quantity * servings,
      reference: input.reference,
      note: input.note,
    });
  }
}

/**
 * Stock at payment: recipe dishes use prepared units then ingredients; others post SALE.
 * HR-005 staff meals go the same way, as STAFF_MEAL (§22: no payment, stock still moves).
 */
export function postSaleStock(
  ctx: MockContext,
  order: {
    id: string;
    number: string;
    locationId: string;
    lines: { productId: string; name: string; quantity: number }[];
  },
  as: { type: 'SALE' | 'STAFF_MEAL'; kind: 'ORDER' | 'STAFF_MEAL' } = {
    type: 'SALE',
    kind: 'ORDER',
  },
) {
  const state = db.get();
  const reference = { kind: as.kind, id: order.id, number: order.number };
  for (const l of order.lines.filter((x) => x.quantity > 0)) {
    const recipe = activeRecipe(state, ctx.me.tenant.id, l.productId);
    const fromPrepared = takePrepared(ctx, l.productId, order.locationId, l.quantity, order);
    if (recipe) {
      consumeIngredients(ctx, recipe, l.quantity - fromPrepared, order.locationId, {
        type: as.type === 'STAFF_MEAL' ? 'STAFF_MEAL' : 'PRODUCTION_CONSUMPTION',
        reference,
        note: `${l.name} ×${l.quantity - fromPrepared}`,
      });
    } else {
      postMovement(ctx, {
        productId: l.productId,
        locationId: order.locationId,
        type: as.type,
        quantity: -l.quantity,
        reference,
        ...(fromPrepared ? { note: `${fromPrepared} from the prepared queue` } : {}),
      });
    }
  }
}

/** Void: ingredients the sale consumed go back (prepared units used aren't re-queued). */
export function reverseRecipeConsumption(
  ctx: MockContext,
  order: { id: string; number: string; locationId: string },
) {
  const used = new Map<string, number>();
  for (const m of db.get().stockMovements) {
    if (
      m.tenantId === ctx.me.tenant.id &&
      m.type === 'PRODUCTION_CONSUMPTION' &&
      m.reference.kind === 'ORDER' &&
      m.reference.id === order.id
    ) {
      const key = settingKey(m.productId, m.locationId);
      used.set(key, (used.get(key) ?? 0) - m.quantity);
    }
  }
  for (const [key, quantity] of used) {
    const [productId = '', locationId = ''] = key.split(':');
    if (quantity > 0) {
      postMovement(ctx, {
        productId,
        locationId,
        type: 'RETURN',
        quantity,
        reference: { kind: 'VOID', id: order.id, number: order.number },
        note: 'Invoice voided — ingredients back',
      });
    }
  }
}

export function createPrepared(
  ctx: MockContext,
  input: {
    productId: string;
    locationId: string;
    quantity: number;
    source: PreparedRecord['source'];
    shelfLifeHours?: number;
    note?: string;
  },
): PreparedRecord {
  const now = new Date();
  const expires = new Date(
    now.getTime() + (input.shelfLifeHours ?? DEFAULT_SHELF_LIFE_HOURS) * 3_600_000,
  );
  const record: PreparedRecord = {
    id: newId('prep'),
    tenantId: ctx.me.tenant.id,
    productId: input.productId,
    productName: nameOf(db.get(), input.productId),
    locationId: input.locationId as PreparedRecord['locationId'],
    quantity: input.quantity,
    remaining: input.quantity,
    source: input.source,
    ...(input.note ? { note: input.note } : {}),
    status: 'AVAILABLE',
    preparedAt: now.toISOString(),
    preparedBy: ctx.me.user.displayName,
    expiresAt: expires.toISOString(),
    uses: [],
  };
  db.update((d) => {
    d.preparedItems.push(record);
  });
  return record;
}

/**
 * SCN-004 food cancelled after the kitchen made it. Recipe dishes: the ingredients were used
 * (wasted, eaten by staff, or now waiting in the prepared queue). Other items: as before, plus the
 * queue entry for Resell. Returns the queue entry, if any.
 */
export function postPreparedDisposition(
  ctx: MockContext,
  order: { id: string; number: string; locationId: string },
  line: { productId: string; name: string },
  quantity: number,
  disposition: 'NOT_PREPARED' | 'RESALE' | 'WASTAGE' | 'STAFF_MEAL',
) {
  if (quantity <= 0 || disposition === 'NOT_PREPARED') return null;
  const recipe = activeRecipe(db.get(), ctx.me.tenant.id, line.productId);
  const reference = { kind: 'KOT_CANCEL' as const, id: order.id, number: order.number };
  if (disposition === 'WASTAGE' || disposition === 'STAFF_MEAL') {
    if (recipe) {
      consumeIngredients(ctx, recipe, quantity, order.locationId, {
        type: disposition,
        reference,
        note: `${line.name} ×${quantity} cancelled after cooking`,
      });
    } else {
      postMovement(ctx, {
        productId: line.productId,
        locationId: order.locationId,
        type: disposition,
        quantity: -quantity,
        reference,
        note: 'Cancelled after sending to the kitchen',
      });
    }
    return null;
  }
  // RESALE: cooked, waiting for the next order.
  if (recipe) {
    consumeIngredients(ctx, recipe, quantity, order.locationId, {
      type: 'PRODUCTION_CONSUMPTION',
      reference,
      note: `${line.name} ×${quantity} cooked, kept for resale`,
    });
  }
  return createPrepared(ctx, {
    productId: line.productId,
    locationId: order.locationId,
    quantity,
    source: { kind: 'KOT_CANCEL', orderId: order.id, orderNumber: order.number },
  });
}

export function requireDish(ctx: MockContext, productId: string) {
  const product = db
    .get()
    .products.find((p) => p.id === productId && p.tenantId === ctx.me.tenant.id);
  if (!product || product.kind === 'INGREDIENT') {
    throw new MockHttpError('NOT_FOUND', 404, 'Menu item not found');
  }
  return product;
}
