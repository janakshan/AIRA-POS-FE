import type { PortionDefinition, Product, StockMovement, StockUnit } from '@rbp/types';
import type { MockDb, ProductionBatchRecord, ProductionPlanRecord } from './seed';

/**
 * BAK-* demo data for the pilot tenant (FLOW-BAK-001). The Bakery Outlet bakes its cakes and,
 * from today, its bread:
 * - Raw materials at the Bakery (ingredients, same ledger as REC-*): flour, sugar, butter,
 *   yeast, cocoa, plus eggs (the Main kitchen's egg item, stocked here too).
 * - Six days of completed plans (butter + chocolate cake, a few rejects), one expired write-off.
 * - Today: butter cake COMPLETED, chocolate cake IN_PROGRESS, bread PLANNED (2 runs = 40 loaves)
 *   — which needs 20 bags of flour with 18 on hand, so BAK-001 shows a shortage.
 * Bread stays at 24 (LOW) until a bread batch is completed; cake openings are lowered by what
 * was baked so the outlet's stock stays about where INV-* had it.
 */

const T1 = 'ten_01PILOT';
const BAKERY = 'loc_01BAKERY';
const SEEDED_AT = '2026-01-01T00:00:00.000Z';
const BAKER = 'Suresh Kumar';

const BREAD = 'prd_01B03';
const BUTTER_CAKE = 'prd_01B02';
const CHOC_CAKE = 'prd_01B01';

const FLOUR = 'ing_01FLOUR';
const SUGAR = 'ing_01SUGAR';
const BUTTER = 'ing_01BUTTER';
const YEAST = 'ing_01YEAST';
const COCOA = 'ing_01COCOA';
const EGG = 'ing_01EGG';

const MATERIALS: {
  id: string;
  code: string;
  name: string;
  unit: StockUnit;
  portion: PortionDefinition;
}[] = [
  {
    id: FLOUR,
    code: 'M01',
    name: 'Wheat Flour',
    unit: 'pack',
    portion: { description: '1 kg bag', grams: 1000 },
  },
  {
    id: SUGAR,
    code: 'M02',
    name: 'Sugar',
    unit: 'pack',
    portion: { description: '1 kg pack', grams: 1000 },
  },
  {
    id: BUTTER,
    code: 'M03',
    name: 'Butter',
    unit: 'pack',
    portion: { description: '250 g block', grams: 250 },
  },
  {
    id: YEAST,
    code: 'M04',
    name: 'Yeast',
    unit: 'pcs',
    portion: { description: '10 g sachet', grams: 10 },
  },
  {
    id: COCOA,
    code: 'M05',
    name: 'Cocoa Powder',
    unit: 'pack',
    portion: { description: '250 g pack', grams: 250 },
  },
];

/** Final on hand / minimum at the Bakery. */
const TARGETS: Record<string, { target: number; minStock: number }> = {
  [FLOUR]: { target: 18, minStock: 10 },
  [SUGAR]: { target: 12, minStock: 5 },
  [BUTTER]: { target: 14, minStock: 6 },
  [YEAST]: { target: 10, minStock: 4 },
  [COCOA]: { target: 4, minStock: 2 },
  [EGG]: { target: 36, minStock: 24 },
};

/** One batch run. */
export const FORMULAS: { productId: string; yieldQuantity: number; lines: [string, number][] }[] = [
  {
    productId: BREAD,
    yieldQuantity: 20,
    lines: [
      [FLOUR, 10],
      [SUGAR, 1],
      [BUTTER, 2],
      [YEAST, 4],
    ],
  },
  {
    productId: BUTTER_CAKE,
    yieldQuantity: 24,
    lines: [
      [FLOUR, 2],
      [SUGAR, 3],
      [BUTTER, 4],
      [EGG, 12],
    ],
  },
  {
    productId: CHOC_CAKE,
    yieldQuantity: 24,
    lines: [
      [FLOUR, 2],
      [SUGAR, 3],
      [BUTTER, 4],
      [EGG, 12],
      [COCOA, 1],
    ],
  },
];

/** Before seedInventory: raw materials (stock-only products) and formulas. */
export function seedProductionMaterials(db: MockDb) {
  for (const m of MATERIALS) {
    const product: Product = {
      id: m.id as Product['id'],
      tenantId: T1 as Product['tenantId'],
      categoryId: 'cat_01INGREDIENTS' as Product['categoryId'],
      code: m.code,
      name: m.name,
      nameTranslations: {},
      imageUrl: null,
      basePrice: { amount: 0, currency: 'LKR' },
      taxMode: 'INCLUSIVE',
      barcodes: [],
      isActive: true,
      showOnQuickPad: false,
      stockUnit: m.unit,
      kind: 'INGREDIENT',
      portion: m.portion,
      createdAt: SEEDED_AT,
      updatedAt: SEEDED_AT,
    };
    db.products.push(product);
  }
  for (const f of FORMULAS) {
    db.productionFormulas.push({
      tenantId: T1,
      productId: f.productId,
      yieldQuantity: f.yieldQuantity,
      lines: f.lines.map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
    });
  }
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayAt = (daysAgo: number, hour: number, minute = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

interface BatchSeed {
  productId: string;
  runs: number;
  planned: number;
  status: ProductionBatchRecord['status'];
  start?: Date;
  end?: Date;
  good?: number;
  rejected?: number;
  reason?: { code: string; label: string };
}

/** After seedInventory / seedPreparedItems: plans, batches and their ledger movements. */
export function seedProduction(db: MockDb) {
  const product = (id: string) => db.products.find((p) => p.id === id)!;
  const formula = (id: string) => db.productionFormulas.find((f) => f.productId === id)!;
  const movements: (StockMovement & { tenantId: string })[] = [];
  let m = 0;
  const move = (
    productId: string,
    type: StockMovement['type'],
    quantity: number,
    at: string,
    reference: StockMovement['reference'],
    extra: Partial<StockMovement> = {},
  ) => {
    const p = product(productId);
    movements.push({
      id: `stm_prd_${++m}`,
      tenantId: T1,
      productId,
      productName: p.name,
      productCode: p.code,
      unit: p.stockUnit ?? 'pcs',
      locationId: BAKERY as StockMovement['locationId'],
      type,
      quantity,
      balanceAfter: 0,
      reference,
      createdBy: BAKER,
      at,
      ...extra,
    });
  };

  const burnt = { code: 'BURNT', label: 'Burnt / over-baked' };
  const underbaked = { code: 'UNDERBAKED', label: 'Under-baked' };
  const days: { daysAgo: number; batches: BatchSeed[] }[] = [];
  const history: [number, number, number][] = [
    // [daysAgo, butter rejects, chocolate rejects]
    [6, 0, 1],
    [5, 1, 0],
    [4, 0, 2],
    [3, 0, 0],
    [2, 2, 1],
    [1, 0, 1],
  ];
  for (const [d, butterRej, chocRej] of history) {
    days.push({
      daysAgo: d,
      batches: [
        {
          productId: BUTTER_CAKE,
          runs: 1,
          planned: 24,
          status: 'COMPLETED',
          start: dayAt(d, 5),
          end: dayAt(d, 7),
          good: 24 - butterRej,
          rejected: butterRej,
          ...(butterRej ? { reason: burnt } : {}),
        },
        {
          productId: CHOC_CAKE,
          runs: 1,
          planned: 24,
          status: 'COMPLETED',
          start: dayAt(d, 6),
          end: dayAt(d, 8, 30),
          good: 24 - chocRej,
          rejected: chocRej,
          ...(chocRej ? { reason: underbaked } : {}),
        },
      ],
    });
  }
  days.push({
    daysAgo: 0,
    batches: [
      {
        productId: BUTTER_CAKE,
        runs: 1,
        planned: 24,
        status: 'COMPLETED',
        start: hoursAgo(3),
        end: hoursAgo(1),
        good: 22,
        rejected: 2,
        reason: burnt,
      },
      {
        productId: CHOC_CAKE,
        runs: 1,
        planned: 24,
        status: 'IN_PROGRESS',
        start: hoursAgo(0.5),
      },
      { productId: BREAD, runs: 2, planned: 40, status: 'PLANNED' },
    ],
  });

  let planNo = 0;
  let batchNo = 0;
  for (const day of days) {
    const planId = `pln_seed_${day.daysAgo}`;
    const planNumber = `PLN-${pad6(++planNo)}`;
    const planDate = localDate(dayAt(day.daysAgo, 12));
    const createdAt = dayAt(day.daysAgo + 1, 16).toISOString();
    const lines: ProductionPlanRecord['lines'] = [];
    for (const b of day.batches) {
      const p = product(b.productId);
      const f = formula(b.productId);
      const id = `bat_seed_${day.daysAgo}_${p.code}`;
      const number = `BAT-${pad6(++batchNo)}`;
      const ref = { kind: 'PRODUCTION_BATCH' as const, id, number };
      const started = b.status === 'COMPLETED' || b.status === 'IN_PROGRESS';
      const record: ProductionBatchRecord = {
        id,
        tenantId: T1,
        number,
        planId,
        planNumber,
        planDate,
        productId: p.id,
        productName: p.name,
        productCode: p.code,
        unit: p.stockUnit ?? 'pcs',
        locationId: BAKERY as ProductionBatchRecord['locationId'],
        status: b.status,
        runs: b.runs,
        expectedQuantity: b.runs * f.yieldQuantity,
        consumption: f.lines.map((l) => ({
          ingredientId: l.ingredientId,
          plannedQuantity: l.quantity * b.runs,
          actualQuantity: started ? l.quantity * b.runs : null,
        })),
        goodQuantity: b.good ?? null,
        rejectedQuantity: b.rejected ?? null,
        ...(b.reason ? { rejectReason: b.reason } : {}),
        ...(started && b.start ? { startedAt: b.start.toISOString(), startedBy: BAKER } : {}),
        ...(b.status === 'COMPLETED' && b.end
          ? { completedAt: b.end.toISOString(), completedBy: BAKER }
          : {}),
      };
      db.productionBatches.push(record);
      lines.push({
        productId: p.id,
        productName: p.name,
        productCode: p.code,
        unit: p.stockUnit ?? 'pcs',
        plannedQuantity: b.planned,
        runs: b.runs,
        expectedQuantity: record.expectedQuantity,
        batchId: id,
      });
      if (started && b.start) {
        for (const c of record.consumption) {
          move(
            c.ingredientId,
            'PRODUCTION_CONSUMPTION',
            -(c.actualQuantity ?? 0),
            b.start.toISOString(),
            ref,
            {
              note: `${p.name} ×${b.runs} run`,
            },
          );
        }
      }
      if (b.status === 'COMPLETED' && b.end) {
        const out = (b.good ?? 0) + (b.rejected ?? 0);
        move(p.id, 'PRODUCTION_OUTPUT', out, b.end.toISOString(), ref);
        if (b.rejected && b.reason) {
          move(p.id, 'WASTAGE', -b.rejected, b.end.toISOString(), ref, { reason: b.reason });
        }
      }
    }
    const statuses = day.batches.map((b) => b.status);
    db.productionPlans.push({
      id: planId,
      tenantId: T1,
      number: planNumber,
      locationId: BAKERY as ProductionPlanRecord['locationId'],
      planDate,
      status: statuses.every((s) => s === 'COMPLETED')
        ? 'COMPLETED'
        : statuses.some((s) => s !== 'PLANNED')
          ? 'IN_PROGRESS'
          : 'CONFIRMED',
      lines,
      createdBy: BAKER,
      createdAt,
      confirmedBy: BAKER,
      confirmedAt: createdAt,
    });
  }

  // ADJ-000002: 3 chocolate cake slices expired two days ago (a BAK-004 write-off).
  const expiredAt = dayAt(2, 19).toISOString();
  const expired = { code: 'EXPIRED', label: 'Expired' };
  const choc = product(CHOC_CAKE);
  move(
    CHOC_CAKE,
    'WASTAGE',
    -3,
    expiredAt,
    { kind: 'ADJUSTMENT', id: 'adj_seed_2', number: 'ADJ-000002' },
    { reason: expired, approvedBy: BAKER, note: 'End of day, past sell-by' },
  );
  const writeOff = movements[movements.length - 1]!;

  // Raw material openings: the targets plus everything baking used.
  const opening = dayAt(30, 7).toISOString();
  const openingRef = { kind: 'OPENING' as const, id: null, number: 'Opening stock' };
  const used = new Map<string, number>();
  for (const x of movements) {
    if (x.type === 'PRODUCTION_CONSUMPTION') {
      used.set(x.productId, (used.get(x.productId) ?? 0) - x.quantity);
    }
  }
  for (const [id, { target, minStock }] of Object.entries(TARGETS)) {
    move(id, 'OPENING', target + (used.get(id) ?? 0), opening, openingRef, {
      createdBy: 'Nirmala Rajan',
    });
    db.stockSettings[`${id}:${BAKERY}`] = { minStock };
  }
  db.stockMovements.push(...movements);

  // Cakes: lower the openings by what was baked (net of rejects and write-offs).
  for (const productId of [BUTTER_CAKE, CHOC_CAKE]) {
    const net = movements
      .filter((x) => x.productId === productId)
      .reduce((s, x) => s + x.quantity, 0);
    const open = db.stockMovements.find(
      (x) =>
        x.tenantId === T1 &&
        x.type === 'OPENING' &&
        x.productId === productId &&
        x.locationId === BAKERY,
    );
    if (open) open.quantity = Math.max(0, open.quantity - net);
  }

  // Re-run the Bakery balances in time order; never let history dip below zero.
  db.stockMovements.sort((a, b) => a.at.localeCompare(b.at));
  const touched = new Set([...movements.map((x) => x.productId)]);
  for (const productId of touched) {
    const rows = db.stockMovements.filter(
      (x) => x.tenantId === T1 && x.productId === productId && x.locationId === BAKERY,
    );
    let balance = 0;
    let low = 0;
    for (const r of rows) {
      balance += r.quantity;
      low = Math.min(low, balance);
    }
    const open = rows.find((r) => r.type === 'OPENING');
    if (low < 0 && open) open.quantity -= low;
    balance = 0;
    for (const r of rows) {
      balance += r.quantity;
      r.balanceAfter = balance;
    }
  }

  db.stockAdjustments.push({
    id: 'adj_seed_2',
    tenantId: T1,
    number: 'ADJ-000002',
    productId: choc.id,
    productName: choc.name,
    unit: choc.stockUnit ?? 'pcs',
    locationId: BAKERY as never,
    kind: 'WASTAGE',
    quantity: 3,
    before: writeOff.balanceAfter + 3,
    after: writeOff.balanceAfter,
    movementId: writeOff.id,
    reason: expired,
    approvedBy: BAKER,
    createdBy: BAKER,
    at: expiredAt,
  });

  db.orderSequences[`ADJ:${T1}`] = 2;
  db.orderSequences[`PLN:${T1}`] = planNo;
  db.orderSequences[`BAT:${T1}`] = batchNo;
}

const pad6 = (n: number) => String(n).padStart(6, '0');
