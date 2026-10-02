import type { ApiError } from '@rbp/api-client';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(
  email: string,
  locationId = 'loc_01BAKERY',
  deviceId: string | null = 'dev_04',
) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(locationId);
  useSessionStore.getState().setDevice(deviceId);
}

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ApiError) => e,
  );

async function pin(code: string, reasonCode: string) {
  const { verificationId } = await api.identity.verifyEmployee({
    pin: code,
    action: 'production.wastage',
  });
  return { verificationId, reasonCode };
}

const BAKERY = 'loc_01BAKERY';
const BREAD = 'prd_01B03';
const BUTTER_CAKE = 'prd_01B02';
const CHOC_CAKE = 'prd_01B01';
const FLOUR = 'ing_01FLOUR';
const COCOA = 'ing_01COCOA';

const onHand = async (productId: string) =>
  (await api.inventory.get(productId)).levels.find((l) => l.locationId === BAKERY)?.onHand ?? 0;

/** Every page of the item's ledger (REP history makes it longer than one page). */
async function ledgerTotal(productId: string) {
  let total = 0;
  for (let page = 1; ; page++) {
    const r = await api.stockMovements.list({ productId, locationId: BAKERY, pageSize: 100, page });
    total += r.items.reduce((s, m) => s + m.quantity, 0);
    if (page * r.pageSize >= r.total) return total;
  }
}

const today = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

describe('mock production: BAK-001 dashboard and seeded day', () => {
  it("shows today's plan, the flour shortage and a week of wastage", async () => {
    await signInAs('manager@pilot.demo');
    const s = await api.production.summary(BAKERY);
    expect(s.date).toBe(today());
    expect(s.batches).toMatchObject({ PLANNED: 1, IN_PROGRESS: 1, COMPLETED: 1 });
    expect(s.planned).toBe(24 + 24 + 40);
    expect(s.produced).toBe(22);
    // Bread: 2 runs × 10 bags, 18 on hand.
    expect(s.shortages).toEqual([
      expect.objectContaining({ ingredientId: FLOUR, needed: 20, onHand: 18 }),
    ]);
    expect(s.wastageUnits7d).toBeGreaterThan(0);
    expect(s.trend).toHaveLength(7);
    // Bread is LOW (24/30) until a bread batch is completed.
    expect(s.lowFinishedGoods).toBe(1);
    expect(await onHand(BREAD)).toBe(24);
  });
});

describe('mock production: FLOW-BAK-001 plan → batch → output → wastage → stock', () => {
  it('posts consumption, output and rejects on the ledger and keeps it reconciled', async () => {
    await signInAs('manager@pilot.demo');
    const flour = await onHand(FLOUR);
    const cocoa = await onHand(COCOA);
    const cake = await onHand(CHOC_CAKE);

    // Plan: 30 slices → 2 runs of 24.
    const draft = await api.production.plans.create({
      locationId: BAKERY,
      planDate: today(),
      lines: [{ productId: CHOC_CAKE, plannedQuantity: 30 }],
    });
    expect(draft).toMatchObject({ status: 'DRAFT', number: 'PLN-000008' });
    expect(draft.lines[0]).toMatchObject({ runs: 2, expectedQuantity: 48 });

    const plan = await api.production.plans.confirm(draft.id);
    expect(plan.status).toBe('CONFIRMED');
    const batchId = plan.lines[0]!.batchId!;
    let batch = await api.production.batches.get(batchId);
    expect(batch).toMatchObject({ status: 'PLANNED', runs: 2, expectedQuantity: 48 });
    expect(batch.consumption.find((c) => c.ingredientId === FLOUR)?.plannedQuantity).toBe(4);

    // Start: raw materials leave stock (the baker used 1 extra bag of flour).
    batch = await api.production.batches.start(batchId, {
      consumption: [{ ingredientId: FLOUR, quantity: 5 }],
    });
    expect(batch.status).toBe('IN_PROGRESS');
    expect(await onHand(FLOUR)).toBe(flour - 5);
    expect(await onHand(COCOA)).toBe(cocoa - 2);
    expect((await api.production.plans.get(plan.id)).status).toBe('IN_PROGRESS');

    // Record output: 45 good, 3 burnt.
    batch = await api.production.batches.complete(batchId, {
      goodQuantity: 45,
      rejectedQuantity: 3,
      rejectReasonCode: 'BURNT',
    });
    expect(batch.status).toBe('COMPLETED');
    expect(batch.movements.map((m) => [m.type, m.productId, m.quantity])).toEqual(
      expect.arrayContaining([
        ['PRODUCTION_CONSUMPTION', FLOUR, -5],
        ['PRODUCTION_OUTPUT', CHOC_CAKE, 48],
        ['WASTAGE', CHOC_CAKE, -3],
      ]),
    );
    expect(await onHand(CHOC_CAKE)).toBe(cake + 45);
    expect(await ledgerTotal(CHOC_CAKE)).toBe(cake + 45);
    expect((await api.production.plans.get(plan.id)).status).toBe('COMPLETED');

    // Finished goods show it; wastage lists the rejects.
    const goods = await api.production.finishedGoods(BAKERY);
    expect(goods.find((g) => g.productId === CHOC_CAKE)).toMatchObject({
      onHand: cake + 45,
      lastBatch: { number: batch.number, goodQuantity: 45 },
    });
    const wastage = await api.production.wastage.list({ locationId: BAKERY, days: 0 });
    expect(wastage.items[0]).toMatchObject({
      source: 'BATCH',
      number: batch.number,
      quantity: 3,
      reason: { code: 'BURNT' },
    });

    // Write off 2 damaged slices: manager PIN + reason.
    const entry = await api.production.wastage.create({
      locationId: BAKERY,
      productId: CHOC_CAKE,
      quantity: 2,
      verification: await pin('2222', 'DAMAGED'),
    });
    expect(entry).toMatchObject({
      source: 'FINISHED_GOODS',
      quantity: 2,
      approvedBy: 'Suresh Kumar',
      reason: { code: 'DAMAGED' },
    });
    expect(await onHand(CHOC_CAKE)).toBe(cake + 43);

    const audit = await api.audit.list({ entityId: batchId });
    expect(audit.items.map((e) => e.action)).toEqual([
      'production.batch.complete',
      'production.batch.start',
    ]);
  });

  it('completing the seeded bread batch clears the low bread (after buying flour)', async () => {
    await signInAs('owner@pilot.demo');
    const bread = (
      await api.production.batches.list({ locationId: BAKERY, status: 'PLANNED' })
    )[0]!;
    expect(bread.productId).toBe(BREAD);
    // 20 bags needed, 18 on hand.
    expect(await fail(api.production.batches.start(bread.id))).toMatchObject({
      status: 409,
      details: { reason: 'OUT_OF_STOCK', items: [expect.objectContaining({ productId: FLOUR })] },
    });
    // Nothing moved.
    expect(await onHand(FLOUR)).toBe(18);
    // The baker makes do with 18 bags.
    await api.production.batches.start(bread.id, {
      consumption: [{ ingredientId: FLOUR, quantity: 18 }],
    });
    await api.production.batches.complete(bread.id, { goodQuantity: 38, rejectedQuantity: 0 });
    const goods = await api.production.finishedGoods(BAKERY);
    expect(goods.find((g) => g.productId === BREAD)).toMatchObject({
      onHand: 24 + 38,
      status: 'OK',
      producedToday: 38,
    });
  });
});

describe('mock production: state machine and guards', () => {
  it('rejects invalid transitions and bad input', async () => {
    await signInAs('manager@pilot.demo');
    const batches = await api.production.batches.list({ locationId: BAKERY, date: today() });
    const done = batches.find((b) => b.productId === BUTTER_CAKE)!;
    const running = batches.find((b) => b.productId === CHOC_CAKE)!;
    expect(await fail(api.production.batches.start(done.id))).toMatchObject({
      status: 409,
      details: { reason: 'INVALID_STATE', status: 'COMPLETED' },
    });
    expect(
      await fail(api.production.batches.cancel(running.id, { reason: 'Oven broke' })),
    ).toMatchObject({
      status: 409,
    });
    // Rejects need a reason; something must come out.
    expect(
      await fail(
        api.production.batches.complete(running.id, { goodQuantity: 20, rejectedQuantity: 4 }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(
      await fail(
        api.production.batches.complete(running.id, { goodQuantity: 0, rejectedQuantity: 0 }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
    // A reason that isn't for wastage.
    expect(
      await fail(
        api.production.batches.complete(running.id, {
          goodQuantity: 20,
          rejectedQuantity: 4,
          rejectReasonCode: 'LOYAL_CUSTOMER',
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });

    // Only drafts change; confirmed plans can be cancelled until baking starts.
    const today_ = (await api.production.plans.list({ locationId: BAKERY, from: today() }))[0]!;
    expect(today_.status).toBe('IN_PROGRESS');
    expect(
      await fail(api.production.plans.cancel(today_.id, { reason: 'No power' })),
    ).toMatchObject({
      status: 409,
    });
    const draft = await api.production.plans.create({
      locationId: BAKERY,
      planDate: today(),
      lines: [{ productId: BREAD, plannedQuantity: 10 }],
    });
    await api.production.plans.confirm(draft.id);
    expect(await fail(api.production.plans.confirm(draft.id))).toMatchObject({ status: 409 });
    const cancelled = await api.production.plans.cancel(draft.id, { reason: 'Order fell through' });
    expect(cancelled.status).toBe('CANCELLED');
    expect(
      (await api.production.batches.list({ locationId: BAKERY, planId: draft.id }))[0]?.status,
    ).toBe('CANCELLED');

    // Production runs at bakery locations only.
    expect(
      await fail(
        api.production.plans.create({
          locationId: 'loc_01MAIN',
          planDate: today(),
          lines: [{ productId: BREAD, plannedQuantity: 10 }],
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('needs a PIN from someone who can manage production to write goods off', async () => {
    await signInAs('manager@pilot.demo');
    const body = { locationId: BAKERY, productId: BUTTER_CAKE, quantity: 1 };
    // Priya (bakery cashier) can't approve.
    expect(await fail(pin('6666', 'DAMAGED'))).toMatchObject({ code: 'EMPLOYEE_NOT_AUTHORIZED' });
    expect(
      await fail(
        api.production.wastage.create({
          ...body,
          verification: { verificationId: 'nope', reasonCode: 'DAMAGED' },
        }),
      ),
    ).toMatchObject({ code: 'VERIFICATION_REQUIRED' });
  });

  it('is gated by the BAKERY_PRODUCTION feature and production.manage', async () => {
    await signInAs('owner@grocery.demo', 'loc_02TOWN', 'dev_06');
    expect(await fail(api.production.summary())).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
    await signInAs('kitchen@pilot.demo', 'loc_01MAIN', 'dev_03');
    expect(await fail(api.production.batches.list())).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs('cashier@pilot.demo', 'loc_01MAIN', 'dev_01');
    expect(await fail(api.production.finishedGoods())).toMatchObject({ code: 'FORBIDDEN' });
  });
});
