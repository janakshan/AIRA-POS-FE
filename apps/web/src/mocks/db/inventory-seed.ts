import type { StockMovement, StockMovementType, StockUnit } from '@rbp/types';
import { INGREDIENT_TARGETS } from './recipe-seed';
import type { MockDb } from './seed';

/**
 * Opening stock, history and demo states for INV-* (SCN-003 low stock):
 * - Main: Fish Rice & Curry 3 (min 5), Egg Pastry 2 (min 10) → low; Vegetable Roti 0 → out.
 * - Bakery: Sandwich Bread 24 (min 30) → low; Central Store holds 60 more to transfer.
 * Every sold item has stock; history sales (OLD- orders) are on the ledger too.
 */

const T1 = 'ten_01PILOT';
const MAIN = 'loc_01MAIN';
const BAKERY = 'loc_01BAKERY';
const STORE = 'loc_01STORE';

const daysAgo = (days: number, hour = 8) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const UNITS: Record<string, StockUnit> = {
  cat_01RICE: 'portion',
  cat_01FRIED: 'portion',
  cat_01BIRIYANI: 'portion',
  cat_01KOTTU: 'portion',
  cat_01NOODLES: 'portion',
  cat_01SOUPS: 'portion',
  cat_01DEVILLED: 'portion',
  cat_01DESSERTS: 'portion',
  cat_02DAIRY: 'pack',
  cat_02DRY: 'pack',
};

/** Final on-hand targets that differ from the generous default. */
const TARGETS: Record<string, number> = {
  [`prd_01R03:${MAIN}`]: 3,
  [`prd_01S05:${MAIN}`]: 2,
  [`prd_01S02:${MAIN}`]: 0,
};

const MINIMUMS: Record<string, number> = {
  [`prd_01R03:${MAIN}`]: 5,
  [`prd_01S05:${MAIN}`]: 10,
  [`prd_01S02:${MAIN}`]: 20,
  [`prd_01B03:${BAKERY}`]: 30,
};

const defaultQty = (categoryId: string) =>
  categoryId.startsWith('cat_02') ? 40 : categoryId === 'cat_01SHORT' ? 80 : 60;

export function seedInventory(db: MockDb) {
  for (const p of db.products) {
    if (p.kind !== 'INGREDIENT') p.stockUnit = UNITS[p.categoryId] ?? 'pcs';
  }
  // REC: dishes made to order have no finished stock; their sales use ingredients.
  const recipeOf = (productId: string) =>
    db.recipes.find((r) => r.productId === productId && r.isActive);

  let n = 0;
  const balances = new Map<string, number>();
  const move = (
    tenantId: string,
    productId: string,
    locationId: string,
    type: StockMovementType,
    quantity: number,
    at: string,
    reference: StockMovement['reference'],
    extra: Partial<StockMovement> = {},
  ) => {
    const product = db.products.find((p) => p.id === productId)!;
    const key = `${productId}:${locationId}`;
    const balanceAfter = (balances.get(key) ?? 0) + quantity;
    balances.set(key, balanceAfter);
    db.stockMovements.push({
      id: `stm_seed_${++n}`,
      tenantId,
      productId,
      productName: product.name,
      productCode: product.code,
      unit: product.stockUnit ?? 'pcs',
      locationId: locationId as StockMovement['locationId'],
      type,
      quantity,
      balanceAfter,
      reference,
      createdBy: 'Nirmala Rajan',
      at,
      ...extra,
    });
  };

  // History sales per (product, location), so openings land on the targets.
  const sold = new Map<string, number>();
  for (const o of db.orders.filter((x) => x.status === 'PAID')) {
    for (const l of o.lines) {
      const key = `${l.productId}:${o.locationId}`;
      sold.set(key, (sold.get(key) ?? 0) + l.quantity);
    }
  }

  // Ingredients the history sales of recipe dishes used, per (ingredient, location).
  const used = new Map<string, number>();
  for (const [key, qty] of sold) {
    const [productId = '', locationId = ''] = key.split(':');
    for (const l of recipeOf(productId)?.lines ?? []) {
      const k = `${l.ingredientId}:${locationId}`;
      used.set(k, (used.get(k) ?? 0) + qty * l.quantity);
    }
  }

  // Opening stock for everything sold, 30 days ago.
  const opening = daysAgo(30, 7);
  const openingRef = { kind: 'OPENING' as const, id: null, number: 'Opening stock' };
  for (const [key, { target, minStock }] of INGREDIENT_TARGETS) {
    const [productId = '', locationId = ''] = key.split(':');
    move(T1, productId, locationId, 'OPENING', target + (used.get(key) ?? 0), opening, openingRef);
    db.stockSettings[key] = { minStock };
  }
  for (const r of db.locationProducts.filter((x) => x.enabled)) {
    const product = db.products.find((p) => p.id === r.productId);
    if (!product || recipeOf(r.productId)) continue;
    const key = `${r.productId}:${r.locationId}`;
    const target = TARGETS[key] ?? defaultQty(product.categoryId);
    let qty = target + (sold.get(key) ?? 0);
    // Bakery bread also gets a transfer and a wastage below.
    if (key === `prd_01B03:${BAKERY}`) qty = 10 + (sold.get(key) ?? 0);
    if (qty > 0) move(r.tenantId, r.productId, r.locationId, 'OPENING', qty, opening, openingRef);
    db.stockSettings[key] = {
      minStock: MINIMUMS[key] ?? (product.categoryId.startsWith('cat_02') ? 8 : 10),
    };
  }
  // Central Store holds bakery goods and short eats for the outlets.
  for (const [productId, qty] of [
    ['prd_01B01', 40],
    ['prd_01B02', 40],
    ['prd_01B03', 80],
    ['prd_01S01', 100],
    ['prd_01S03', 100],
  ] as const) {
    move(T1, productId, STORE, 'OPENING', qty, opening, openingRef);
    db.stockSettings[`${productId}:${STORE}`] = { minStock: 20 };
  }

  // History sales. Lines taken off before paying (quantity 0) moved no stock.
  for (const o of db.orders.filter((x) => x.status === 'PAID')) {
    for (const l of o.lines) {
      if (l.quantity <= 0) continue;
      const recipe = recipeOf(l.productId);
      if (recipe) {
        for (const r of recipe.lines) {
          move(
            o.tenantId,
            r.ingredientId,
            o.locationId,
            'PRODUCTION_CONSUMPTION',
            -l.quantity * r.quantity,
            o.paidAt ?? o.createdAt,
            { kind: 'ORDER', id: o.id, number: o.number },
            { createdBy: o.createdBy, note: `${l.name} ×${l.quantity}` },
          );
        }
        continue;
      }
      move(
        o.tenantId,
        l.productId,
        o.locationId,
        'SALE',
        -l.quantity,
        o.paidAt ?? o.createdAt,
        {
          kind: 'ORDER',
          id: o.id,
          number: o.number,
        },
        { createdBy: o.createdBy },
      );
    }
  }

  // TRF-000001: 20 loaves Central Store → Bakery, received.
  const dispatched = daysAgo(10, 6);
  const received = daysAgo(10, 9);
  const trf = { kind: 'TRANSFER' as const, id: 'trf_seed_1', number: 'TRF-000001' };
  move(T1, 'prd_01B03', STORE, 'TRANSFER_OUT', -20, dispatched, trf);
  move(T1, 'prd_01B03', BAKERY, 'TRANSFER_IN', 20, received, trf, { createdBy: 'Suresh Kumar' });
  const bread = db.products.find((p) => p.id === 'prd_01B03')!;
  db.stockTransfers.push({
    id: 'trf_seed_1',
    tenantId: T1,
    number: 'TRF-000001',
    fromLocationId: STORE as never,
    toLocationId: BAKERY as never,
    status: 'RECEIVED',
    lines: [
      {
        productId: bread.id,
        code: bread.code,
        name: bread.name,
        unit: bread.stockUnit ?? 'pcs',
        quantity: 20,
        receivedQuantity: 20,
      },
    ],
    dispatchedBy: 'Nirmala Rajan',
    dispatchedAt: dispatched,
    receivedBy: 'Suresh Kumar',
    receivedAt: received,
  });

  // ADJ-000001: 6 loaves expired at the Bakery.
  const expired = daysAgo(4, 17);
  const reason = { code: 'EXPIRED', label: 'Expired' };
  move(
    T1,
    'prd_01B03',
    BAKERY,
    'WASTAGE',
    -6,
    expired,
    {
      kind: 'ADJUSTMENT',
      id: 'adj_seed_1',
      number: 'ADJ-000001',
    },
    { reason, approvedBy: 'Suresh Kumar', createdBy: 'Suresh Kumar' },
  );
  db.stockAdjustments.push({
    id: 'adj_seed_1',
    tenantId: T1,
    number: 'ADJ-000001',
    productId: bread.id,
    productName: bread.name,
    unit: bread.stockUnit ?? 'pcs',
    locationId: BAKERY as never,
    kind: 'WASTAGE',
    quantity: 6,
    before: 30,
    after: 24,
    movementId: `stm_seed_${n}`,
    reason,
    approvedBy: 'Suresh Kumar',
    createdBy: 'Suresh Kumar',
    at: expired,
  });

  db.orderSequences[`TRF:${T1}`] = 1;
  db.orderSequences[`ADJ:${T1}`] = 1;
  // Moves above are made per order / per event, not in time order (history orders get a random
  // hour within their day), so re-run every running balance once they're sorted by time.
  db.stockMovements.sort((a, b) => a.at.localeCompare(b.at));
  balances.clear();
  for (const m of db.stockMovements) {
    const key = `${m.tenantId}:${m.productId}:${m.locationId}`;
    m.balanceAfter = (balances.get(key) ?? 0) + m.quantity;
    balances.set(key, m.balanceAfter);
  }
}
