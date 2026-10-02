import type {
  FinishedGoodsItem,
  ProductionBatchStatus,
  ProductionPlanStatus,
  ProductionSummary,
  StockAdjustment,
  WastageListResponse,
} from '@rbp/types';
import {
  cancelProductionSchema,
  completeBatchSchema,
  productionPlanSchema,
  productionWastageSchema,
  startBatchSchema,
} from '@rbp/validation';
import { newId, nowIso } from '@rbp/utils';
import { http, HttpResponse } from 'msw';
import { recordAudit, requireVerifiedAction } from '../audit';
import { type MockContext, requireFeature, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import type { ProductionBatchRecord, ProductionPlanRecord } from '../db/seed';
import { API, handle, MockHttpError, parseBody } from '../http';
import {
  assertInStock,
  levelFor,
  nextInventoryNumber,
  onHand,
  onHandIndex,
  postMovement,
  settingKey,
} from '../inventory';
import { locationName, myLocationIds, requireLocationAccess, targetLocation } from '../location';
import {
  batchDetail,
  batchView,
  formulaOf,
  formulasOf,
  localDate,
  planView,
  requireFormula,
  startOfDay,
  syncPlanStatus,
  wastageEntries,
} from '../production';

/**
 * BAK-001…005 (prototype, FLOW-BAK-001): Plan → Start batch (consume raw materials) → Record
 * output (finished goods in, rejects out as wastage) → finished-goods stock.
 */

function productionContext(request: Request) {
  const ctx = resolveContext(request);
  requireFeature(ctx, 'BAKERY_PRODUCTION');
  requirePermission(ctx, 'production.manage');
  return ctx;
}

/** Production happens at bakery-type locations (A-261). */
function requireProductionLocation(ctx: MockContext, locationId: string) {
  requireLocationAccess(ctx, locationId);
  const loc = db.get().locations.find((l) => l.id === locationId);
  if (loc?.type !== 'BAKERY') {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Not a production location', {
      fieldErrors: { locationId: 'validation.productionLocation' },
    });
  }
}

/** `?locationId=all` = every production location the user can access. */
function locationsFor(ctx: MockContext, url: URL) {
  if (url.searchParams.get('locationId') === 'all') {
    const state = db.get();
    return myLocationIds(ctx).filter(
      (id) => state.locations.find((l) => l.id === id)?.type === 'BAKERY',
    );
  }
  return [targetLocation(ctx, url)];
}

function findPlan(ctx: MockContext, id: string) {
  const p = db.get().productionPlans.find((x) => x.id === id && x.tenantId === ctx.me.tenant.id);
  if (!p) throw new MockHttpError('NOT_FOUND', 404, 'Production plan not found');
  requireLocationAccess(ctx, p.locationId);
  return p;
}

function findBatch(ctx: MockContext, id: string) {
  const b = db.get().productionBatches.find((x) => x.id === id && x.tenantId === ctx.me.tenant.id);
  if (!b) throw new MockHttpError('NOT_FOUND', 404, 'Batch not found');
  requireLocationAccess(ctx, b.locationId);
  return b;
}

function invalidState(what: string, status: string) {
  return new MockHttpError('CONFLICT', 409, `${what} is ${status}`, {
    reason: 'INVALID_STATE',
    status,
  });
}

function planLines(ctx: MockContext, lines: { productId: string; plannedQuantity: number }[]) {
  const state = db.get();
  return lines.map((l, i) => {
    const f = formulasOf(state, ctx.me.tenant.id).find((x) => x.productId === l.productId);
    if (!f) {
      throw new MockHttpError('VALIDATION_FAILED', 400, 'No production formula for that item', {
        fieldErrors: { [`lines.${i}.productId`]: 'validation.itemRequired' },
      });
    }
    const p = state.products.find((x) => x.id === l.productId)!;
    const runs = Math.ceil(l.plannedQuantity / f.yieldQuantity);
    return {
      productId: p.id,
      productName: p.name,
      productCode: p.code,
      unit: p.stockUnit ?? 'pcs',
      plannedQuantity: l.plannedQuantity,
      runs,
      expectedQuantity: runs * f.yieldQuantity,
    };
  });
}

function savePlan(plan: ProductionPlanRecord) {
  db.update((d) => {
    d.productionPlans = [...d.productionPlans.filter((p) => p.id !== plan.id), plan];
  });
}

function saveBatch(batch: ProductionBatchRecord) {
  db.update((d) => {
    d.productionBatches = d.productionBatches.map((b) => (b.id === batch.id ? batch : b));
    syncPlanStatus(d, batch.planId);
  });
}

const PLAN_STATUSES: ProductionPlanStatus[] = [
  'DRAFT',
  'CONFIRMED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];
const BATCH_STATUSES: ProductionBatchStatus[] = [
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

export const productionHandlers = [
  /** BAK-001 today at a location. */
  http.get(
    `${API}/production/summary`,
    handle(({ request }) => {
      const ctx = productionContext(request);
      const locationId = targetLocation(ctx, new URL(request.url));
      const state = db.get();
      const tenantId = ctx.me.tenant.id;
      const today = localDate(new Date());
      const index = onHandIndex(state, tenantId);
      const plans = state.productionPlans.filter(
        (p) =>
          p.tenantId === tenantId &&
          p.locationId === locationId &&
          p.planDate === today &&
          p.status !== 'CANCELLED',
      );
      const batches = state.productionBatches.filter(
        (b) => b.tenantId === tenantId && b.locationId === locationId,
      );
      const todays = batches.filter((b) => b.planDate === today);
      const counts: Record<ProductionBatchStatus, number> = {
        PLANNED: 0,
        IN_PROGRESS: 0,
        COMPLETED: 0,
        CANCELLED: 0,
      };
      for (const b of todays) counts[b.status] += 1;

      // Unstarted batches up to today vs raw materials on hand.
      const need = new Map<string, number>();
      for (const b of batches.filter((x) => x.status === 'PLANNED' && x.planDate <= today)) {
        for (const c of b.consumption) {
          need.set(c.ingredientId, (need.get(c.ingredientId) ?? 0) + c.plannedQuantity);
        }
      }
      const shortages = [...need.entries()]
        .map(([ingredientId, needed]) => {
          const p = state.products.find((x) => x.id === ingredientId);
          return {
            ingredientId,
            code: p?.code ?? '',
            name: p?.name ?? ingredientId,
            unit: p?.stockUnit ?? 'pcs',
            needed,
            onHand: Math.max(0, index.qty.get(settingKey(ingredientId, locationId)) ?? 0),
          };
        })
        .filter((s) => s.needed > s.onHand)
        .sort((a, b) => a.name.localeCompare(b.name));

      const bakery = new Set(formulasOf(state, tenantId).map((f) => f.productId));
      const since = startOfDay(6);
      const trend = Array.from({ length: 7 }, (_, i) => ({
        date: localDate(startOfDay(6 - i)),
        produced: 0,
        wasted: 0,
      }));
      for (const m of state.stockMovements) {
        if (
          m.tenantId !== tenantId ||
          m.locationId !== locationId ||
          !bakery.has(m.productId) ||
          m.at < since
        ) {
          continue;
        }
        const day = trend.find((t) => t.date === localDate(m.at));
        if (!day) continue;
        if (m.type === 'PRODUCTION_OUTPUT') day.produced += m.quantity;
        if (m.type === 'WASTAGE') day.wasted -= m.quantity;
      }
      const producedUnits7d = trend.reduce((s, t) => s + t.produced, 0);
      const wastageUnits7d = trend.reduce((s, t) => s + t.wasted, 0);
      const body: ProductionSummary = {
        locationId: locationId as ProductionSummary['locationId'],
        date: today,
        planned: plans.reduce((s, p) => s + p.lines.reduce((n, l) => n + l.plannedQuantity, 0), 0),
        produced: todays.reduce((s, b) => s + (b.goodQuantity ?? 0), 0),
        batches: counts,
        wastageBps: producedUnits7d ? Math.round((wastageUnits7d / producedUnits7d) * 10_000) : 0,
        wastageUnits7d,
        producedUnits7d,
        lowFinishedGoods: [...bakery]
          .map((id) => levelFor(state, tenantId, id, locationId, index))
          .filter((l) => l && l.status !== 'OK').length,
        shortages,
        trend,
      };
      return HttpResponse.json(body);
    }),
  ),

  /** What one run of each bakery product uses and yields. */
  http.get(
    `${API}/production/formulas`,
    handle(({ request }) => {
      const ctx = productionContext(request);
      const locationId = targetLocation(ctx, new URL(request.url));
      const index = onHandIndex(db.get(), ctx.me.tenant.id);
      const items = formulasOf(db.get(), ctx.me.tenant.id)
        .map((f) => formulaOf(ctx, f.productId, locationId, index))
        .sort((a, b) => a.productCode.localeCompare(b.productCode));
      return HttpResponse.json(items);
    }),
  ),

  /** BAK-002 plans, newest plan date first. */
  http.get(
    `${API}/production/plans`,
    handle(({ request }) => {
      const ctx = productionContext(request);
      const url = new URL(request.url);
      const locations = locationsFor(ctx, url);
      const status = PLAN_STATUSES.find((s) => s === url.searchParams.get('status'));
      const from = url.searchParams.get('from');
      const to = url.searchParams.get('to');
      const items = db
        .get()
        .productionPlans.filter(
          (p) =>
            p.tenantId === ctx.me.tenant.id &&
            locations.includes(p.locationId) &&
            (!status || p.status === status) &&
            (!from || p.planDate >= from) &&
            (!to || p.planDate <= to),
        )
        .sort((a, b) => b.planDate.localeCompare(a.planDate) || b.number.localeCompare(a.number))
        .map(planView);
      return HttpResponse.json(items);
    }),
  ),

  http.get(
    `${API}/production/plans/:id`,
    handle(({ request, params }) => {
      const ctx = productionContext(request);
      return HttpResponse.json(planView(findPlan(ctx, String(params.id))));
    }),
  ),

  http.post(
    `${API}/production/plans`,
    handle(async ({ request }) => {
      const ctx = productionContext(request);
      const input = await parseBody(request, productionPlanSchema);
      requireProductionLocation(ctx, input.locationId);
      const plan: ProductionPlanRecord = {
        id: newId('pln'),
        tenantId: ctx.me.tenant.id,
        number: nextInventoryNumber(ctx, 'PLN'),
        locationId: input.locationId as ProductionPlanRecord['locationId'],
        planDate: input.planDate,
        status: 'DRAFT',
        lines: planLines(ctx, input.lines),
        ...(input.note ? { note: input.note } : {}),
        createdBy: ctx.me.user.displayName,
        createdAt: nowIso(),
      };
      savePlan(plan);
      recordAudit(ctx, {
        action: 'production.plan.create',
        entity: 'production-plan',
        entityId: plan.id,
        entityLabel: `${plan.number} · ${plan.planDate} · ${locationName(plan.locationId)}`,
        before: null,
        after: plan,
      });
      return HttpResponse.json(planView(plan), { status: 201 });
    }),
  ),

  /** Only drafts can change. */
  http.put(
    `${API}/production/plans/:id`,
    handle(async ({ request, params }) => {
      const ctx = productionContext(request);
      const before = findPlan(ctx, String(params.id));
      if (before.status !== 'DRAFT') throw invalidState('Plan', before.status);
      const input = await parseBody(request, productionPlanSchema);
      requireProductionLocation(ctx, input.locationId);
      const plan: ProductionPlanRecord = {
        ...before,
        locationId: input.locationId as ProductionPlanRecord['locationId'],
        planDate: input.planDate,
        lines: planLines(ctx, input.lines),
      };
      if (input.note) plan.note = input.note;
      else delete plan.note;
      savePlan(plan);
      recordAudit(ctx, {
        action: 'production.plan.update',
        entity: 'production-plan',
        entityId: plan.id,
        entityLabel: `${plan.number} · ${plan.planDate}`,
        before,
        after: plan,
      });
      return HttpResponse.json(planView(plan));
    }),
  ),

  /** DRAFT → CONFIRMED: one PLANNED batch per line. */
  http.post(
    `${API}/production/plans/:id/confirm`,
    handle(({ request, params }) => {
      const ctx = productionContext(request);
      const before = findPlan(ctx, String(params.id));
      if (before.status !== 'DRAFT') throw invalidState('Plan', before.status);
      const state = db.get();
      const batches: ProductionBatchRecord[] = before.lines.map((l) => {
        const f = requireFormula(ctx, l.productId);
        return {
          id: newId('bat'),
          tenantId: ctx.me.tenant.id,
          number: nextInventoryNumber(ctx, 'BAT'),
          planId: before.id,
          planNumber: before.number,
          planDate: before.planDate,
          productId: l.productId,
          productName: l.productName,
          productCode: l.productCode,
          unit: state.products.find((p) => p.id === l.productId)?.stockUnit ?? 'pcs',
          locationId: before.locationId,
          status: 'PLANNED',
          runs: l.runs,
          expectedQuantity: l.expectedQuantity,
          consumption: f.lines.map((c) => ({
            ingredientId: c.ingredientId,
            plannedQuantity: c.quantity * l.runs,
            actualQuantity: null,
          })),
          goodQuantity: null,
          rejectedQuantity: null,
        };
      });
      const now = nowIso();
      const plan: ProductionPlanRecord = {
        ...before,
        status: 'CONFIRMED',
        confirmedBy: ctx.me.user.displayName,
        confirmedAt: now,
        lines: before.lines.map((l, i) => ({ ...l, batchId: batches[i]!.id })),
      };
      db.update((d) => {
        d.productionBatches.push(...batches);
      });
      savePlan(plan);
      recordAudit(ctx, {
        action: 'production.plan.confirm',
        entity: 'production-plan',
        entityId: plan.id,
        entityLabel: `${plan.number} · ${batches.map((b) => `${b.number} ${b.productName} ×${b.expectedQuantity}`).join(', ')}`,
        before,
        after: plan,
      });
      return HttpResponse.json(planView(plan));
    }),
  ),

  /** Before anything is baked: the plan and its unstarted batches. */
  http.post(
    `${API}/production/plans/:id/cancel`,
    handle(async ({ request, params }) => {
      const ctx = productionContext(request);
      const before = findPlan(ctx, String(params.id));
      if (before.status !== 'DRAFT' && before.status !== 'CONFIRMED') {
        throw invalidState('Plan', before.status);
      }
      const input = await parseBody(request, cancelProductionSchema);
      const now = nowIso();
      const by = ctx.me.user.displayName;
      const plan: ProductionPlanRecord = {
        ...before,
        status: 'CANCELLED',
        cancelledBy: by,
        cancelledAt: now,
        cancelReason: input.reason,
      };
      db.update((d) => {
        for (const b of d.productionBatches) {
          if (b.planId === plan.id && b.status === 'PLANNED') {
            Object.assign(b, {
              status: 'CANCELLED',
              cancelledBy: by,
              cancelledAt: now,
              cancelReason: input.reason,
            });
          }
        }
      });
      savePlan(plan);
      recordAudit(ctx, {
        action: 'production.plan.cancel',
        entity: 'production-plan',
        entityId: plan.id,
        entityLabel: `${plan.number} · ${input.reason}`,
        before,
        after: plan,
      });
      return HttpResponse.json(planView(plan));
    }),
  ),

  /** BAK-003 batches, by plan date then number. */
  http.get(
    `${API}/production/batches`,
    handle(({ request }) => {
      const ctx = productionContext(request);
      const url = new URL(request.url);
      const locations = locationsFor(ctx, url);
      const status = BATCH_STATUSES.find((s) => s === url.searchParams.get('status'));
      const planId = url.searchParams.get('planId');
      const date = url.searchParams.get('date');
      const index = onHandIndex(db.get(), ctx.me.tenant.id);
      const items = db
        .get()
        .productionBatches.filter(
          (b) =>
            b.tenantId === ctx.me.tenant.id &&
            locations.includes(b.locationId) &&
            (!status || b.status === status) &&
            (!planId || b.planId === planId) &&
            (!date || b.planDate === date),
        )
        .sort((a, b) => b.planDate.localeCompare(a.planDate) || a.number.localeCompare(b.number))
        .map((b) => batchView(ctx, b, index));
      return HttpResponse.json(items);
    }),
  ),

  http.get(
    `${API}/production/batches/:id`,
    handle(({ request, params }) => {
      const ctx = productionContext(request);
      return HttpResponse.json(batchDetail(ctx, findBatch(ctx, String(params.id))));
    }),
  ),

  /** PLANNED → IN_PROGRESS: the raw materials leave stock now (PRODUCTION_CONSUMPTION). */
  http.post(
    `${API}/production/batches/:id/start`,
    handle(async ({ request, params }) => {
      const ctx = productionContext(request);
      const before = findBatch(ctx, String(params.id));
      if (before.status !== 'PLANNED') throw invalidState('Batch', before.status);
      const input = await parseBody(request, startBatchSchema);
      const actual = new Map(input.consumption?.map((c) => [c.ingredientId, c.quantity]) ?? []);
      for (const id of actual.keys()) {
        if (!before.consumption.some((c) => c.ingredientId === id)) {
          throw new MockHttpError('VALIDATION_FAILED', 400, 'Not in this formula', {
            ingredientId: id,
          });
        }
      }
      const consumption = before.consumption.map((c) => ({
        ...c,
        actualQuantity: actual.get(c.ingredientId) ?? c.plannedQuantity,
      }));
      assertInStock(
        ctx,
        before.locationId,
        consumption.map((c) => ({ productId: c.ingredientId, quantity: c.actualQuantity })),
      );
      const reference = { kind: 'PRODUCTION_BATCH' as const, id: before.id, number: before.number };
      for (const c of consumption) {
        if (c.actualQuantity <= 0) continue;
        postMovement(ctx, {
          productId: c.ingredientId,
          locationId: before.locationId,
          type: 'PRODUCTION_CONSUMPTION',
          quantity: -c.actualQuantity,
          reference,
          note: `${before.productName} ×${before.runs} run${before.runs === 1 ? '' : 's'}`,
        });
      }
      const batch: ProductionBatchRecord = {
        ...before,
        status: 'IN_PROGRESS',
        consumption,
        startedAt: nowIso(),
        startedBy: ctx.me.user.displayName,
        ...(input.note ? { note: input.note } : {}),
      };
      saveBatch(batch);
      const changed = consumption.filter((c) => c.actualQuantity !== c.plannedQuantity);
      recordAudit(ctx, {
        action: 'production.batch.start',
        entity: 'production-batch',
        entityId: batch.id,
        entityLabel: `${batch.number} · ${batch.productName} ×${batch.expectedQuantity}${changed.length ? ' · used differs from formula' : ''}`,
        before,
        after: batch,
      });
      return HttpResponse.json(batchDetail(ctx, batch));
    }),
  ),

  /**
   * IN_PROGRESS → COMPLETED: everything that came out goes in (PRODUCTION_OUTPUT), then the
   * rejects go out as WASTAGE with their reason — so on hand = good units.
   */
  http.post(
    `${API}/production/batches/:id/complete`,
    handle(async ({ request, params }) => {
      const ctx = productionContext(request);
      const before = findBatch(ctx, String(params.id));
      if (before.status !== 'IN_PROGRESS') throw invalidState('Batch', before.status);
      const input = await parseBody(request, completeBatchSchema);
      let rejectReason: ProductionBatchRecord['rejectReason'];
      if (input.rejectedQuantity > 0) {
        const reason = (db.get().reasons[ctx.me.tenant.id] ?? []).find(
          (r) =>
            r.code === input.rejectReasonCode &&
            (!r.appliesTo?.length || r.appliesTo.includes('production.wastage')),
        );
        if (!reason) {
          throw new MockHttpError('VALIDATION_FAILED', 400, 'Reason not valid for wastage', {
            fieldErrors: { rejectReasonCode: 'validation.reasonRequired' },
          });
        }
        if (reason.requiresComment && (input.rejectComment ?? '').trim().length < 3) {
          throw new MockHttpError('VALIDATION_FAILED', 400, 'Comment required', {
            fieldErrors: { rejectComment: 'validation.commentRequired' },
          });
        }
        rejectReason = {
          code: reason.code,
          label: reason.label,
          ...(input.rejectComment ? { comment: input.rejectComment } : {}),
        };
      }
      const reference = { kind: 'PRODUCTION_BATCH' as const, id: before.id, number: before.number };
      const total = input.goodQuantity + input.rejectedQuantity;
      postMovement(ctx, {
        productId: before.productId,
        locationId: before.locationId,
        type: 'PRODUCTION_OUTPUT',
        quantity: total,
        reference,
      });
      if (input.rejectedQuantity > 0 && rejectReason) {
        postMovement(ctx, {
          productId: before.productId,
          locationId: before.locationId,
          type: 'WASTAGE',
          quantity: -input.rejectedQuantity,
          reference,
          reason: rejectReason,
        });
      }
      const batch: ProductionBatchRecord = {
        ...before,
        status: 'COMPLETED',
        goodQuantity: input.goodQuantity,
        rejectedQuantity: input.rejectedQuantity,
        ...(rejectReason ? { rejectReason } : {}),
        completedAt: nowIso(),
        completedBy: ctx.me.user.displayName,
      };
      saveBatch(batch);
      recordAudit(ctx, {
        action: 'production.batch.complete',
        entity: 'production-batch',
        entityId: batch.id,
        entityLabel: `${batch.number} · ${batch.productName} · ${input.goodQuantity} good${input.rejectedQuantity ? `, ${input.rejectedQuantity} ${rejectReason?.label.toLowerCase()}` : ''}`,
        before,
        after: batch,
      });
      return HttpResponse.json(batchDetail(ctx, batch));
    }),
  ),

  /** Only a batch that hasn't started (nothing to reverse). */
  http.post(
    `${API}/production/batches/:id/cancel`,
    handle(async ({ request, params }) => {
      const ctx = productionContext(request);
      const before = findBatch(ctx, String(params.id));
      if (before.status !== 'PLANNED') throw invalidState('Batch', before.status);
      const input = await parseBody(request, cancelProductionSchema);
      const batch: ProductionBatchRecord = {
        ...before,
        status: 'CANCELLED',
        cancelledAt: nowIso(),
        cancelledBy: ctx.me.user.displayName,
        cancelReason: input.reason,
      };
      saveBatch(batch);
      recordAudit(ctx, {
        action: 'production.batch.cancel',
        entity: 'production-batch',
        entityId: batch.id,
        entityLabel: `${batch.number} · ${batch.productName} · ${input.reason}`,
        before,
        after: batch,
      });
      return HttpResponse.json(batchDetail(ctx, batch));
    }),
  ),

  /** BAK-004 finished bakery goods at a location. */
  http.get(
    `${API}/production/finished-goods`,
    handle(({ request }) => {
      const ctx = productionContext(request);
      const locationId = targetLocation(ctx, new URL(request.url));
      const state = db.get();
      const tenantId = ctx.me.tenant.id;
      const index = onHandIndex(state, tenantId);
      const since = startOfDay(0);
      const items: FinishedGoodsItem[] = formulasOf(state, tenantId)
        .map((f) => {
          const level = levelFor(state, tenantId, f.productId, locationId, index)!;
          const done = state.productionBatches
            .filter(
              (b) =>
                b.tenantId === tenantId &&
                b.productId === f.productId &&
                b.locationId === locationId &&
                b.status === 'COMPLETED' &&
                b.completedAt,
            )
            .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
          const last = done[0];
          const wastedToday = state.stockMovements
            .filter(
              (m) =>
                m.tenantId === tenantId &&
                m.productId === f.productId &&
                m.locationId === locationId &&
                m.type === 'WASTAGE' &&
                m.at >= since,
            )
            .reduce((s, m) => s - m.quantity, 0);
          return {
            productId: f.productId,
            code: level.code,
            name: level.name,
            unit: level.unit,
            locationId: level.locationId,
            onHand: level.onHand,
            minStock: level.minStock,
            status: level.status,
            producedToday: done
              .filter((b) => (b.completedAt ?? '') >= since)
              .reduce((s, b) => s + (b.goodQuantity ?? 0), 0),
            wastedToday,
            lastBatch:
              last && last.completedAt
                ? {
                    id: last.id,
                    number: last.number,
                    completedAt: last.completedAt,
                    goodQuantity: last.goodQuantity ?? 0,
                  }
                : null,
          };
        })
        .sort((a, b) => a.code.localeCompare(b.code));
      return HttpResponse.json(items);
    }),
  ),

  /** BAK-005 wastage of bakery goods, from the ledger. */
  http.get(
    `${API}/production/wastage`,
    handle(({ request }) => {
      const ctx = productionContext(request);
      const url = new URL(request.url);
      const locations = locationsFor(ctx, url);
      const days = Math.min(Math.max(Number(url.searchParams.get('days') ?? 30) || 0, 0), 365);
      const source = url.searchParams.get('source');
      const reasonCode = url.searchParams.get('reasonCode');
      const all = wastageEntries(db.get(), ctx.me.tenant.id, locations, startOfDay(days)).filter(
        (w) => !source || w.source === source,
      );
      const byReason = new Map<string, { code: string; label: string; quantity: number }>();
      for (const w of all) {
        const r = byReason.get(w.reason.code) ?? {
          code: w.reason.code,
          label: w.reason.label,
          quantity: 0,
        };
        r.quantity += w.quantity;
        byReason.set(w.reason.code, r);
      }
      const items = all.filter((w) => !reasonCode || w.reason.code === reasonCode);
      const body: WastageListResponse = {
        items,
        byReason: [...byReason.values()].sort((a, b) => b.quantity - a.quantity),
        total: items.reduce((s, w) => s + w.quantity, 0),
      };
      return HttpResponse.json(body);
    }),
  ),

  /** Write off finished bakery goods: PIN + reason, an ADJ- adjustment, audited. */
  http.post(
    `${API}/production/wastage`,
    handle(async ({ request }) => {
      const ctx = productionContext(request);
      const input = await parseBody(request, productionWastageSchema);
      requireLocationAccess(ctx, input.locationId);
      requireFormula(ctx, input.productId);
      const state = db.get();
      const product = state.products.find((p) => p.id === input.productId)!;
      const before = onHand(state, ctx.me.tenant.id, product.id, input.locationId);
      if (input.quantity > before) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'More than is in stock', {
          fieldErrors: { quantity: 'validation.belowZero' },
          onHand: before,
        });
      }
      const verified = requireVerifiedAction(ctx, input.verification, 'production.wastage');
      const id = newId('adj');
      const number = nextInventoryNumber(ctx, 'ADJ');
      const movement = postMovement(ctx, {
        productId: product.id,
        locationId: input.locationId,
        type: 'WASTAGE',
        quantity: -input.quantity,
        reference: { kind: 'ADJUSTMENT', id, number },
        reason: verified.reason,
        approvedBy: verified.employee.fullName,
        ...(input.note ? { note: input.note } : {}),
      });
      const adjustment: StockAdjustment = {
        id,
        number,
        productId: product.id,
        productName: product.name,
        unit: product.stockUnit ?? 'pcs',
        locationId: input.locationId as StockAdjustment['locationId'],
        kind: 'WASTAGE',
        quantity: input.quantity,
        before,
        after: movement.balanceAfter,
        movementId: movement.id,
        reason: verified.reason,
        approvedBy: verified.employee.fullName,
        createdBy: ctx.me.user.displayName,
        at: movement.at,
      };
      db.update((d) => {
        d.stockAdjustments.push({ ...adjustment, tenantId: ctx.me.tenant.id });
      });
      recordAudit(ctx, {
        action: 'production.wastage.create',
        entity: 'product',
        entityId: product.id,
        entityLabel: `${number} · ${product.name} @ ${locationName(input.locationId)} · ${input.quantity} written off (${verified.reason.label})`,
        before: { onHand: before },
        after: { onHand: movement.balanceAfter },
        verified,
      });
      const entry = wastageEntries(
        db.get(),
        ctx.me.tenant.id,
        [input.locationId],
        movement.at,
      ).find((w) => w.id === movement.id)!;
      return HttpResponse.json(entry, { status: 201 });
    }),
  ),
];
