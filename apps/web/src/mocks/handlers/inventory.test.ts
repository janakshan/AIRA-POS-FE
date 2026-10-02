import type { ApiError } from '@rbp/api-client';
import type { SensitiveActionCode } from '@rbp/types';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';
import { createSeed } from '@/mocks/db/seed';

async function signInAs(
  email: string,
  locationId = 'loc_01MAIN',
  deviceId: string | null = 'dev_01',
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

async function pin(code: string, action: SensitiveActionCode, reasonCode: string) {
  const { verificationId } = await api.identity.verifyEmployee({ pin: code, action });
  return { verificationId, reasonCode };
}

const levelOf = async (productId: string, locationId: string) =>
  (await api.inventory.get(productId)).levels.find((l) => l.locationId === locationId)!;

/** On hand must always equal the sum of the item's movements. */
async function ledgerTotal(productId: string, locationId: string) {
  let total = 0;
  for (let page = 1; ; page++) {
    const r = await api.stockMovements.list({ productId, locationId, pageSize: 100, page });
    total += r.items.reduce((s, m) => s + m.quantity, 0);
    if (page * r.pageSize >= r.total) return total;
  }
}

describe('mock inventory: INV-001/002/003 stock from the ledger', () => {
  it('lists stock per location with low/out status and a summary', async () => {
    await signInAs('manager@pilot.demo');
    const main = await api.inventory.list({ pageSize: 100 });
    expect(main.items.every((l) => l.locationId === 'loc_01MAIN')).toBe(true);
    const byCode = new Map(main.items.map((l) => [l.code, l]));
    expect(byCode.get('R03')).toMatchObject({
      onHand: 3,
      minStock: 5,
      status: 'LOW',
      unit: 'portion',
    });
    expect(byCode.get('S05')).toMatchObject({ onHand: 2, status: 'LOW', unit: 'pcs' });
    expect(byCode.get('S02')).toMatchObject({ onHand: 0, status: 'OUT' });
    expect(main.summary).toMatchObject({ low: 2, out: 1 });

    const low = await api.inventory.list({ status: 'LOW' });
    expect(low.items.map((l) => l.code).sort()).toEqual(['R03', 'S05']);
    // "All" covers every location the user may see (manager: Main + Bakery).
    const all = await api.inventory.list({ locationId: 'all', search: 'bread' });
    expect(all.items.map((l) => l.locationId)).toEqual(['loc_01BAKERY', 'loc_01MAIN']);
    expect(await fail(api.inventory.list({ locationId: 'loc_01STORE' }))).toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('keeps on hand equal to the sum of movements, and shows history', async () => {
    await signInAs('owner@pilot.demo');
    const bread = await api.inventory.get('prd_01B03');
    expect(bread.levels.map((l) => [l.locationId, l.onHand, l.status])).toEqual([
      ['loc_01BAKERY', 24, 'LOW'],
      ['loc_01MAIN', 60, 'OK'],
      ['loc_01STORE', 60, 'OK'],
      // WHO seed: the day's load on Van 1 (no minimum set for vans).
      ['loc_01VAN1', 40, 'OK'],
    ]);
    expect(await ledgerTotal('prd_01B03', 'loc_01BAKERY')).toBe(24);
    expect(bread.recent.map((m) => m.type)).toEqual(
      expect.arrayContaining(['WASTAGE', 'TRANSFER_IN', 'TRANSFER_OUT', 'OPENING']),
    );
    // Seeded history sales are on the ledger too.
    const sales = await api.stockMovements.list({ type: 'SALE', productId: 'prd_01K01' });
    expect(sales.items.length).toBeGreaterThan(0);
    expect(sales.items[0]?.reference.number).toMatch(/^(OLD|HX)-/);
  });

  it('seeds every running balance in time order, ending at on hand (QA M14)', () => {
    const seed = createSeed();
    const balances = new Map<string, number>();
    const broken: string[] = [];
    // Same order INV-003 shows (newest first, reversed): by time, ties in push order.
    const ledger = seed.stockMovements.slice().sort((a, b) => a.at.localeCompare(b.at));
    for (const m of ledger) {
      const key = `${m.tenantId}:${m.productId}:${m.locationId}`;
      const expected = (balances.get(key) ?? 0) + m.quantity;
      if (m.balanceAfter !== expected) broken.push(`${m.productCode}@${m.locationId} ${m.id}`);
      if (m.quantity === 0) broken.push(`${m.productCode}@${m.locationId} ${m.id} quantity 0`);
      balances.set(key, m.balanceAfter);
    }
    expect(broken).toEqual([]);
    // Newest balances still land on the INV-* demo targets.
    const last = (productId: string, locationId: string) =>
      balances.get(`ten_01PILOT:${productId}:${locationId}`);
    expect(last('prd_01R03', 'loc_01MAIN')).toBe(3);
    expect(last('prd_01S05', 'loc_01MAIN')).toBe(2);
    expect(last('prd_01S02', 'loc_01MAIN')).toBe(0);
    expect(last('prd_01B03', 'loc_01BAKERY')).toBe(24);
  });
});

describe('mock inventory: INV-004 adjustment (FLOW-INV-001)', () => {
  it('needs an authorised PIN and an inventory reason, then moves stock and audits it', async () => {
    await signInAs('manager@pilot.demo');
    const before = (await levelOf('prd_01S01', 'loc_01MAIN')).onHand;
    // No verification → refused; a cashier can't approve.
    expect(
      await fail(
        api.stockAdjustments.create({
          locationId: 'loc_01MAIN',
          productId: 'prd_01S01',
          kind: 'WASTAGE',
          quantity: 2,
          verification: { verificationId: 'nope', reasonCode: 'EXPIRED' },
        }),
      ),
    ).toMatchObject({ code: 'VERIFICATION_REQUIRED' });
    expect(await fail(pin('3333', 'inventory.adjust', 'EXPIRED'))).toMatchObject({
      code: 'EMPLOYEE_NOT_AUTHORIZED',
    });
    // A POS reason doesn't fit a stock adjustment.
    expect(
      await fail(
        api.stockAdjustments.create({
          locationId: 'loc_01MAIN',
          productId: 'prd_01S01',
          kind: 'WASTAGE',
          quantity: 2,
          verification: await pin('2222', 'inventory.adjust', 'LOYAL_CUSTOMER'),
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });

    const wastage = await api.stockAdjustments.create({
      locationId: 'loc_01MAIN',
      productId: 'prd_01S01',
      kind: 'WASTAGE',
      quantity: 2,
      verification: await pin('2222', 'inventory.adjust', 'EXPIRED'),
    });
    expect(wastage).toMatchObject({
      number: 'ADJ-000003',
      before,
      after: before - 2,
      approvedBy: 'Suresh Kumar',
      reason: { code: 'EXPIRED' },
    });
    const [movement] = (
      await api.stockMovements.list({ productId: 'prd_01S01', locationId: 'loc_01MAIN' })
    ).items;
    expect(movement).toMatchObject({
      type: 'WASTAGE',
      quantity: -2,
      balanceAfter: before - 2,
      reference: { kind: 'ADJUSTMENT', number: 'ADJ-000003' },
      approvedBy: 'Suresh Kumar',
    });

    // Count: the difference is the adjustment.
    const counted = await api.stockAdjustments.create({
      locationId: 'loc_01MAIN',
      productId: 'prd_01S01',
      kind: 'COUNT',
      quantity: 70,
      verification: await pin('2222', 'inventory.adjust', 'STOCK_COUNT'),
    });
    expect(counted).toMatchObject({ before: before - 2, after: 70 });
    expect((await levelOf('prd_01S01', 'loc_01MAIN')).onHand).toBe(70);
    expect(await ledgerTotal('prd_01S01', 'loc_01MAIN')).toBe(70);

    // Can't take stock below zero.
    expect(
      await fail(
        api.stockAdjustments.create({
          locationId: 'loc_01MAIN',
          productId: 'prd_01R03',
          kind: 'REMOVE',
          quantity: 4,
          verification: await pin('2222', 'inventory.adjust', 'DAMAGED'),
        }),
      ),
    ).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fieldErrors: { quantity: 'validation.belowZero' } },
    });

    await signInAs('owner@pilot.demo');
    const [event] = (await api.audit.list({ action: 'inventory.adjust' })).items;
    expect(event).toMatchObject({
      entityLabel: expect.stringContaining('ADJ-000004 · Fish Bun @ Main Restaurant · count'),
      employee: { fullName: 'Suresh Kumar' },
      reason: { code: 'STOCK_COUNT' },
    });
    expect((await api.stockAdjustments.list()).items[0]?.number).toBe('ADJ-000004');
  });

  it('sets minimum stock (no PIN) and the item turns low', async () => {
    await signInAs('manager@pilot.demo');
    const level = await api.inventory.setMinStock('prd_01S01', 'loc_01MAIN', { minStock: 90 });
    expect(level).toMatchObject({ minStock: 90, status: 'LOW' });
    expect((await api.inventory.lowStock()).map((l) => l.code)).toContain('S01');
    const dashboard = await api.dashboard.summary();
    expect(dashboard.lowStockItems).toBe(4);
    // Cashiers can look but not change it.
    await signInAs('cashier@pilot.demo');
    expect((await api.inventory.list()).total).toBeGreaterThan(0);
    expect(
      await fail(api.inventory.setMinStock('prd_01S01', 'loc_01MAIN', { minStock: 1 })),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('mock inventory: sales on the ledger', () => {
  it('deducts at payment, refuses overselling, and restocks returns and voids', async () => {
    await signInAs('cashier@pilot.demo');
    // Only 3 Fish Rice & Curry left.
    expect(
      await fail(
        api.orders.create({
          lines: [{ productId: 'prd_01R03', quantity: 4 }],
          adjustmentIds: [],
          status: 'OPEN',
        }),
      ),
    ).toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'OUT_OF_STOCK', items: [{ productId: 'prd_01R03', onHand: 3 }] },
    });
    // Out of stock entirely.
    expect(
      await fail(
        api.orders.create({
          lines: [{ productId: 'prd_01S02', quantity: 1 }],
          adjustmentIds: [],
          status: 'OPEN',
        }),
      ),
    ).toMatchObject({ details: { reason: 'OUT_OF_STOCK' } });

    const order = await api.orders.create({
      lines: [{ productId: 'prd_01R03', quantity: 2 }],
      adjustmentIds: [],
      status: 'OPEN',
    });
    // Saving doesn't take stock; paying does.
    expect((await levelOf('prd_01R03', 'loc_01MAIN')).onHand).toBe(3);
    const paid = await api.orders.pay(order.id, { method: 'CARD' });
    expect((await levelOf('prd_01R03', 'loc_01MAIN')).onHand).toBe(1);
    const [sale] = (await api.stockMovements.list({ productId: 'prd_01R03' })).items;
    expect(sale).toMatchObject({ type: 'SALE', quantity: -2, reference: { number: paid.number } });

    // A return with restock puts one back; without restock it's recorded as wastage.
    await api.orders.createReturn(paid.id, {
      lines: [{ lineId: paid.lines[0]!.id, quantity: 1 }],
      refundMethod: 'ORIGINAL',
      verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
    });
    expect((await levelOf('prd_01R03', 'loc_01MAIN')).onHand).toBe(2);
    await api.orders.createReturn(paid.id, {
      lines: [{ lineId: paid.lines[0]!.id, quantity: 1 }],
      refundMethod: 'ORIGINAL',
      restock: false,
      verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
    });
    expect((await levelOf('prd_01R03', 'loc_01MAIN')).onHand).toBe(2);
    const last = (await api.stockMovements.list({ productId: 'prd_01R03' })).items.slice(0, 2);
    expect(last.map((m) => [m.type, m.quantity])).toEqual([
      ['WASTAGE', -1],
      ['RETURN', 1],
    ]);

    // Void puts the whole sale back.
    const bunsBefore = (await levelOf('prd_01S01', 'loc_01MAIN')).onHand;
    const buns = await api.orders.pay(
      (
        await api.orders.create({
          lines: [{ productId: 'prd_01S01', quantity: 5 }],
          adjustmentIds: [],
          status: 'OPEN',
        })
      ).id,
      { method: 'CARD' },
    );
    expect((await levelOf('prd_01S01', 'loc_01MAIN')).onHand).toBe(bunsBefore - 5);
    await api.orders.void(buns.id, {
      verification: await pin('2222', 'pos.invoice.void', 'WRONG_ITEM_SOLD'),
    });
    expect((await levelOf('prd_01S01', 'loc_01MAIN')).onHand).toBe(bunsBefore);
    expect(await ledgerTotal('prd_01S01', 'loc_01MAIN')).toBe(bunsBefore);
  });

  it('records cancelled prepared food as wastage or staff meal (SCN-004)', async () => {
    await signInAs('waiter@pilot.demo');
    const order = await api.orders.create({
      lines: [{ productId: 'prd_01K01', quantity: 3 }],
      adjustmentIds: [],
      status: 'OPEN',
      type: 'DINE_IN',
      tableId: 'tbl_T5',
    });
    const { order: sent } = await api.orders.sendToKitchen(order.id);
    await signInAs('manager@pilot.demo');
    const before = (await api.inventory.list({ search: 'Chicken Kottu' })).items[0]!.onHand;
    await signInAs('waiter@pilot.demo');
    await api.orders.cancelItem(order.id, sent.lines[0]!.id, {
      quantity: 1,
      disposition: 'STAFF_MEAL',
      verification: await pin('2222', 'pos.item.quantity.decrease', 'CUSTOMER_CHANGED'),
    });
    await signInAs('manager@pilot.demo');
    const after = (await api.inventory.list({ search: 'Chicken Kottu' })).items[0]!;
    expect(after.onHand).toBe(before - 1);
    const [movement] = (await api.stockMovements.list({ productId: 'prd_01K01' })).items;
    expect(movement).toMatchObject({
      type: 'STAFF_MEAL',
      quantity: -1,
      reference: { kind: 'KOT_CANCEL' },
    });
  });

  it('shows live stock on POS location products', async () => {
    await signInAs('cashier@pilot.demo');
    const products = await api.catalog.locationProducts.list();
    const roti = products.find((p) => p.code === 'S02');
    expect(roti?.stock).toMatchObject({ onHand: 0, status: 'OUT' });
    expect(products.find((p) => p.code === 'R03')?.stock).toMatchObject({
      onHand: 3,
      status: 'LOW',
    });
  });
});

describe('mock inventory: INV-005 transfers', () => {
  it('dispatches from one location and receives at another, recording shortages', async () => {
    await signInAs('owner@pilot.demo', 'loc_01STORE', null);
    expect(
      await fail(
        api.stockTransfers.create({
          fromLocationId: 'loc_01STORE',
          toLocationId: 'loc_01BAKERY',
          lines: [{ productId: 'prd_01B03', quantity: 61 }],
        }),
      ),
    ).toMatchObject({ details: { reason: 'OUT_OF_STOCK' } });
    const transfer = await api.stockTransfers.create({
      fromLocationId: 'loc_01STORE',
      toLocationId: 'loc_01BAKERY',
      lines: [
        { productId: 'prd_01B03', quantity: 30 },
        { productId: 'prd_01B01', quantity: 10 },
      ],
      note: 'Morning run',
    });
    expect(transfer).toMatchObject({
      number: 'TRF-000002',
      status: 'IN_TRANSIT',
      dispatchedBy: 'Nirmala Rajan',
    });
    expect((await levelOf('prd_01B03', 'loc_01STORE')).onHand).toBe(30);
    // Not at the bakery until received.
    expect((await levelOf('prd_01B03', 'loc_01BAKERY')).onHand).toBe(24);
    expect((await api.stockTransfers.list({ direction: 'out' })).items[0]?.id).toBe(transfer.id);
    // The owner can see the Bakery, but only someone operating there receives (QA INV-005).
    expect(await fail(api.stockTransfers.receive(transfer.id, { lines: [] }))).toMatchObject({
      code: 'FORBIDDEN',
      details: { reason: 'NOT_DESTINATION' },
    });

    await signInAs('manager@pilot.demo', 'loc_01BAKERY');
    expect((await api.stockTransfers.list({ direction: 'in', status: 'IN_TRANSIT' })).total).toBe(
      1,
    );
    const received = await api.stockTransfers.receive(transfer.id, {
      lines: [
        { productId: 'prd_01B03', receivedQuantity: 29 },
        { productId: 'prd_01B01', receivedQuantity: 10 },
      ],
    });
    expect(received).toMatchObject({ status: 'RECEIVED', receivedBy: 'Suresh Kumar' });
    const bread = await levelOf('prd_01B03', 'loc_01BAKERY');
    expect(bread).toMatchObject({ onHand: 53, status: 'OK' });
    expect(await fail(api.stockTransfers.receive(transfer.id, { lines: [] }))).toMatchObject({
      code: 'CONFLICT',
    });

    await signInAs('owner@pilot.demo');
    const [event] = (await api.audit.list({ action: 'inventory.transfer.receive' })).items;
    expect(event?.entityLabel).toContain('Sandwich Bread (450g) 1 short');
  });

  it('cancels a transfer in transit back to the sender, and checks location access', async () => {
    await signInAs('manager@pilot.demo');
    // Managers can't send from Central Store (no access).
    expect(
      await fail(
        api.stockTransfers.create({
          fromLocationId: 'loc_01STORE',
          toLocationId: 'loc_01MAIN',
          lines: [{ productId: 'prd_01S01', quantity: 5 }],
        }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' });
    const before = (await levelOf('prd_01S01', 'loc_01MAIN')).onHand;
    const transfer = await api.stockTransfers.create({
      fromLocationId: 'loc_01MAIN',
      toLocationId: 'loc_01BAKERY',
      lines: [{ productId: 'prd_01S01', quantity: 5 }],
    });
    expect((await levelOf('prd_01S01', 'loc_01MAIN')).onHand).toBe(before - 5);
    const cancelled = await api.stockTransfers.cancel(transfer.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect((await levelOf('prd_01S01', 'loc_01MAIN')).onHand).toBe(before);
    // Cashiers don't transfer.
    await signInAs('cashier@pilot.demo');
    expect(
      await fail(
        api.stockTransfers.create({
          fromLocationId: 'loc_01MAIN',
          toLocationId: 'loc_01BAKERY',
          lines: [{ productId: 'prd_01S01', quantity: 1 }],
        }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });
});
