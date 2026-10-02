import type {
  ProductionBatch,
  ProductionBatchDetail,
  ProductionFormula,
  ProductionPlan,
  StockMovement,
  WastageEntry,
} from '@rbp/types';
import type { MockContext } from './context';
import { db } from './db';
import type { MockDb, ProductionBatchRecord, ProductionPlanRecord } from './db/seed';
import { MockHttpError } from './http';
import { onHandIndex, settingKey, type MovementRecord } from './inventory';

/**
 * BAK-* helpers (FLOW-BAK-001). Plans and batches are documents; stock only ever changes
 * through ledger movements that reference the batch (kind PRODUCTION_BATCH).
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Local YYYY-MM-DD (plan dates are plain dates at the outlet). */
export const localDate = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** Start of the local day `daysAgo` days back, as ISO. */
export function startOfDay(daysAgo = 0) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export const formulasOf = (state: MockDb, tenantId: string) =>
  state.productionFormulas.filter((f) => f.tenantId === tenantId);

export function requireFormula(ctx: MockContext, productId: string) {
  const f = formulasOf(db.get(), ctx.me.tenant.id).find((x) => x.productId === productId);
  if (!f) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'No production formula for that item', {
      fieldErrors: { productId: 'validation.itemRequired' },
    });
  }
  return f;
}

export function formulaOf(
  ctx: MockContext,
  productId: string,
  locationId: string,
  index = onHandIndex(db.get(), ctx.me.tenant.id),
): ProductionFormula {
  const state = db.get();
  const f = requireFormula(ctx, productId);
  const p = state.products.find((x) => x.id === productId);
  return {
    productId,
    productCode: p?.code ?? '',
    productName: p?.name ?? productId,
    unit: p?.stockUnit ?? 'pcs',
    yieldQuantity: f.yieldQuantity,
    lines: f.lines.map((l) => {
      const ing = state.products.find((x) => x.id === l.ingredientId);
      return {
        ...l,
        code: ing?.code ?? '',
        name: ing?.name ?? l.ingredientId,
        unit: ing?.stockUnit ?? 'pcs',
        onHand: index.qty.get(settingKey(l.ingredientId, locationId)) ?? 0,
      };
    }),
    ...(f.updatedAt ? { updatedAt: f.updatedAt } : {}),
    ...(f.updatedBy ? { updatedBy: f.updatedBy } : {}),
  };
}

/** Raw materials a formula can use: the tenant's active stock-only ingredients (A-262). */
export const materialsOf = (state: MockDb, tenantId: string) =>
  state.products.filter((p) => p.tenantId === tenantId && p.kind === 'INGREDIENT' && p.isActive);

export const batchesOfPlan = (state: MockDb, plan: ProductionPlanRecord) =>
  state.productionBatches.filter((b) => b.tenantId === plan.tenantId && b.planId === plan.id);

export function planView(plan: ProductionPlanRecord): ProductionPlan {
  const { tenantId: _t, ...rest } = plan;
  const batches = batchesOfPlan(db.get(), plan);
  return {
    ...rest,
    progress: {
      batches: batches.length,
      completed: batches.filter((b) => b.status === 'COMPLETED').length,
      produced: batches.reduce((s, b) => s + (b.goodQuantity ?? 0), 0),
      rejected: batches.reduce((s, b) => s + (b.rejectedQuantity ?? 0), 0),
    },
  };
}

export function batchView(
  ctx: MockContext,
  b: ProductionBatchRecord,
  index = onHandIndex(db.get(), ctx.me.tenant.id),
): ProductionBatch {
  const state = db.get();
  const { tenantId: _t, consumption, ...rest } = b;
  return {
    ...rest,
    consumption: consumption.map((c) => {
      const ing = state.products.find((p) => p.id === c.ingredientId);
      return {
        ...c,
        code: ing?.code ?? '',
        name: ing?.name ?? c.ingredientId,
        unit: ing?.stockUnit ?? 'pcs',
        onHand: index.qty.get(settingKey(c.ingredientId, b.locationId)) ?? 0,
      };
    }),
  };
}

const publicMovement = ({ tenantId: _t, ...m }: MovementRecord): StockMovement => m;

export function batchDetail(ctx: MockContext, b: ProductionBatchRecord): ProductionBatchDetail {
  return {
    ...batchView(ctx, b),
    movements: db
      .get()
      .stockMovements.filter(
        (m) =>
          m.tenantId === ctx.me.tenant.id &&
          m.reference.kind === 'PRODUCTION_BATCH' &&
          m.reference.id === b.id,
      )
      .map(publicMovement),
  };
}

/** Plan status follows its batches once confirmed. */
export function syncPlanStatus(state: MockDb, planId: string) {
  const plan = state.productionPlans.find((p) => p.id === planId);
  if (!plan || plan.status === 'DRAFT' || plan.status === 'CANCELLED') return;
  const statuses = batchesOfPlan(state, plan).map((b) => b.status);
  const open = statuses.filter((s) => s !== 'CANCELLED');
  plan.status = !open.length
    ? 'CANCELLED'
    : open.every((s) => s === 'COMPLETED')
      ? 'COMPLETED'
      : open.some((s) => s !== 'PLANNED')
        ? 'IN_PROGRESS'
        : 'CONFIRMED';
}

/** WASTAGE movements of bakery products, as BAK-005 entries. */
export function wastageEntries(
  state: MockDb,
  tenantId: string,
  locationIds: string[],
  since: string,
): WastageEntry[] {
  const bakery = new Set(formulasOf(state, tenantId).map((f) => f.productId));
  return state.stockMovements
    .filter(
      (m) =>
        m.tenantId === tenantId &&
        m.type === 'WASTAGE' &&
        bakery.has(m.productId) &&
        locationIds.includes(m.locationId) &&
        m.at >= since,
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((m) => ({
      id: m.id,
      number: m.reference.number ?? '—',
      source: m.reference.kind === 'PRODUCTION_BATCH' ? 'BATCH' : 'FINISHED_GOODS',
      productId: m.productId,
      productName: m.productName,
      productCode: m.productCode,
      unit: m.unit,
      locationId: m.locationId,
      quantity: -m.quantity,
      reason: m.reason ?? { code: 'OTHER', label: 'Other' },
      ...(m.reference.kind === 'PRODUCTION_BATCH' && m.reference.id
        ? { batchId: m.reference.id }
        : {}),
      ...(m.approvedBy ? { approvedBy: m.approvedBy } : {}),
      recordedBy: m.createdBy,
      at: m.at,
    }));
}
