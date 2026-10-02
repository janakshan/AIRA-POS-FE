import type { PortionDefinition, Product, StockMovement, StockUnit } from '@rbp/types';
import type { MockDb, PreparedRecord } from './seed';

/**
 * REC-* demo data for the pilot tenant (prototype). Main Restaurant's kitchen holds four
 * ingredients counted in portions; three dishes are made to order from them:
 * - Chicken Rice & Curry (core requirements §13/§17 example): rice 1, chicken 1, vegetables 1
 * - Egg Fried Rice: rice 1, egg 2, vegetables 1
 * - Vegetable Rice & Curry: rice 1, vegetables 2
 * Chicken ends on 35 portions with a minimum of 20 (the §21 example). Nothing starts low.
 */

const T1 = 'ten_01PILOT';
const MAIN = 'loc_01MAIN';
const SEEDED_AT = '2026-01-01T00:00:00.000Z';

interface IngredientSeed {
  id: string;
  code: string;
  name: string;
  unit: StockUnit;
  portion: PortionDefinition;
  /** Final on hand at Main. */
  target: number;
  minStock: number;
}

export const INGREDIENTS: IngredientSeed[] = [
  {
    id: 'ing_01CHICKEN',
    code: 'I01',
    name: 'Chicken',
    unit: 'portion',
    portion: { description: '150 g boneless, curry cut', grams: 150, perPack: 6 },
    target: 35,
    minStock: 20,
  },
  {
    id: 'ing_01RICE',
    code: 'I02',
    name: 'Rice',
    unit: 'portion',
    portion: { description: '100 g raw samba (one plate)', grams: 100, perPack: 50 },
    target: 60,
    minStock: 30,
  },
  {
    id: 'ing_01VEG',
    code: 'I03',
    name: 'Vegetables',
    unit: 'portion',
    portion: { description: '120 g mixed curry vegetables', grams: 120 },
    target: 40,
    minStock: 15,
  },
  {
    id: 'ing_01EGG',
    code: 'I04',
    name: 'Egg',
    unit: 'pcs',
    portion: { description: '1 large egg', grams: 55, perPack: 30 },
    target: 30,
    minStock: 12,
  },
];

const RECIPES: { productId: string; lines: [string, number][]; note?: string }[] = [
  {
    productId: 'prd_01R01',
    lines: [
      ['ing_01RICE', 1],
      ['ing_01CHICKEN', 1],
      ['ing_01VEG', 1],
    ],
    note: 'One chicken portion per plate.',
  },
  {
    productId: 'prd_01R04',
    lines: [
      ['ing_01RICE', 1],
      ['ing_01EGG', 2],
      ['ing_01VEG', 1],
    ],
  },
  {
    productId: 'prd_01R02',
    lines: [
      ['ing_01RICE', 1],
      ['ing_01VEG', 2],
    ],
  },
];

/** Ingredient targets at Main, keyed `${ingredientId}:${locationId}` (used by seedInventory). */
export const INGREDIENT_TARGETS = new Map(
  INGREDIENTS.map((i) => [`${i.id}:${MAIN}`, { target: i.target, minStock: i.minStock }]),
);

/** Before seedInventory: ingredients (stock-only products) and recipes. */
export function seedRecipes(db: MockDb) {
  for (const i of INGREDIENTS) {
    const ingredient: Product = {
      id: i.id as Product['id'],
      tenantId: T1 as Product['tenantId'],
      categoryId: 'cat_01INGREDIENTS' as Product['categoryId'],
      code: i.code,
      name: i.name,
      nameTranslations: {},
      imageUrl: null,
      basePrice: { amount: 0, currency: 'LKR' },
      taxMode: 'INCLUSIVE',
      barcodes: [],
      isActive: true,
      showOnQuickPad: false,
      stockUnit: i.unit,
      kind: 'INGREDIENT',
      portion: i.portion,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    };
    db.products.push(ingredient);
  }
  for (const r of RECIPES) {
    db.recipes.push({
      tenantId: T1,
      productId: r.productId,
      lines: r.lines.map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
      isActive: true,
      ...(r.note ? { note: r.note } : {}),
      updatedAt: SEEDED_AT,
      updatedBy: 'Nirmala Rajan',
    });
  }
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

/**
 * After seedInventory: the prepared-item queue (SCN-004). Each entry's ingredients were used
 * when it was cooked; the openings are topped up so the targets above still hold.
 */
export function seedPreparedItems(db: MockDb) {
  const name = (id: string) => db.products.find((p) => p.id === id)?.name ?? id;
  const entries: (Omit<PreparedRecord, 'productName' | 'tenantId' | 'locationId'> & {
    locationId?: string;
  })[] = [
    {
      id: 'prep_seed_1',
      productId: 'prd_01R01',
      quantity: 1,
      remaining: 1,
      source: { kind: 'KOT_CANCEL', orderNumber: 'Table T4' },
      note: 'Guest left before it was served',
      status: 'AVAILABLE',
      preparedAt: hoursAgo(1),
      preparedBy: 'Suresh Kumar',
      expiresAt: hoursAgo(-3),
      uses: [],
    },
    {
      id: 'prep_seed_2',
      productId: 'prd_01R04',
      quantity: 1,
      remaining: 1,
      source: { kind: 'KOT_CANCEL', orderNumber: 'Table O2' },
      status: 'AVAILABLE',
      preparedAt: hoursAgo(6),
      preparedBy: 'Suresh Kumar',
      expiresAt: hoursAgo(2),
      uses: [],
    },
    {
      id: 'prep_seed_3',
      productId: 'prd_01R01',
      quantity: 2,
      remaining: 0,
      source: { kind: 'MANUAL' },
      note: 'Made extra for the lunch rush',
      status: 'DISPOSED',
      preparedAt: hoursAgo(26),
      preparedBy: 'Arun Selvam',
      expiresAt: hoursAgo(22),
      uses: [{ orderId: '', orderNumber: 'Walk-in', quantity: 1, at: hoursAgo(25) }],
      disposal: {
        outcome: 'STAFF_MEAL',
        reason: 'End of lunch, given to kitchen staff',
        quantity: 1,
        by: 'Suresh Kumar',
        at: hoursAgo(22),
      },
    },
  ];

  let n = 0;
  const touched = new Set<string>();
  const extra = new Map<string, number>();
  for (const e of entries) {
    db.preparedItems.push({
      ...e,
      tenantId: T1,
      locationId: MAIN as PreparedRecord['locationId'],
      productName: name(e.productId),
    });
    const recipe = db.recipes.find((r) => r.productId === e.productId);
    // The walk-in sale of prep_seed_3 used a prepared plate, so only the cooking counts.
    for (const l of recipe?.lines ?? []) {
      const key = `${l.ingredientId}:${MAIN}`;
      touched.add(key);
      extra.set(key, (extra.get(key) ?? 0) + l.quantity * e.quantity);
      const product = db.products.find((p) => p.id === l.ingredientId);
      db.stockMovements.push({
        id: `stm_rec_${++n}`,
        tenantId: T1,
        productId: l.ingredientId,
        productName: product?.name ?? l.ingredientId,
        productCode: product?.code ?? '',
        unit: product?.stockUnit ?? 'pcs',
        locationId: MAIN as StockMovement['locationId'],
        type: 'PRODUCTION_CONSUMPTION',
        quantity: -l.quantity * e.quantity,
        balanceAfter: 0,
        reference: {
          kind: e.source.kind === 'KOT_CANCEL' ? 'KOT_CANCEL' : 'ADJUSTMENT',
          id: null,
          number: e.source.orderNumber ?? 'Prepared queue',
        },
        note: `${name(e.productId)} ×${e.quantity} ${
          e.source.kind === 'KOT_CANCEL' ? 'cooked, kept for resale' : 'made extra'
        }`,
        createdBy: e.preparedBy,
        at: e.preparedAt,
      });
    }
  }

  // Top up the openings by what the queue used, then re-run the touched balances in time order.
  for (const m of db.stockMovements) {
    const key = `${m.productId}:${m.locationId}`;
    if (m.tenantId === T1 && m.type === 'OPENING' && extra.has(key)) {
      m.quantity += extra.get(key) ?? 0;
      extra.delete(key);
    }
  }
  db.stockMovements.sort((a, b) => a.at.localeCompare(b.at));
  const balances = new Map<string, number>();
  for (const m of db.stockMovements) {
    const key = `${m.productId}:${m.locationId}`;
    if (m.tenantId !== T1 || !touched.has(key)) continue;
    m.balanceAfter = (balances.get(key) ?? 0) + m.quantity;
    balances.set(key, m.balanceAfter);
  }
}
