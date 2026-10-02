import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

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

/** Kottu → Kitchen, Milk Tea → Bar: two kitchen tickets. */
const dineIn = (tableId: string) =>
  api.orders.create({
    lines: [
      { productId: 'prd_01K01', quantity: 1 },
      { productId: 'prd_01D02', quantity: 1 },
    ],
    adjustmentIds: [],
    status: 'OPEN',
    type: 'DINE_IN',
    tableId,
  });

describe('mock dashboard: DASH-001 summary', () => {
  it('counts open tables and unserved kitchen tickets from real orders', async () => {
    await signInAs('owner@pilot.demo');
    expect(await api.dashboard.summary()).toMatchObject({ openTables: 0, pendingKots: 0 });

    const first = await dineIn('tbl_T4');
    await api.orders.sendToKitchen(first.id);
    await dineIn('tbl_T5');
    expect(await api.dashboard.summary()).toMatchObject({ openTables: 2, pendingKots: 2 });

    // Served tickets drop off; the table stays open until it's paid.
    const [kot] = await api.kots.list();
    await api.kots.start(kot!.id);
    await api.kots.ready(kot!.id);
    await api.kots.complete(kot!.id);
    expect(await api.dashboard.summary()).toMatchObject({ openTables: 2, pendingKots: 1 });
  });

  it('shows no tables, tickets or simulated sales for a store', async () => {
    await signInAs('owner@pilot.demo', 'loc_01STORE', null);
    const summary = await api.dashboard.summary();
    expect(summary).toMatchObject({ openTables: 0, pendingKots: 0, ordersToday: 0 });
    expect(summary.salesToday.amount).toBe(0);
  });
});

describe('mock dashboard: DASH-002 locations', () => {
  it('shows every location the owner can see, busiest first, with matching totals', async () => {
    await signInAs('owner@pilot.demo');
    const board = await api.dashboard.locations();
    const ids = board.locations.map((r) => r.location.id);
    expect([...ids].sort()).toEqual(['loc_01BAKERY', 'loc_01MAIN', 'loc_01STORE', 'loc_01VAN1']);
    const sales = board.locations.map((r) => r.salesToday.amount);
    expect(sales).toEqual([...sales].sort((a, b) => b - a));
    expect(board.totals.salesToday.amount).toBe(sales.reduce((a, b) => a + b, 0));
    expect(board.totals.ordersToday).toBe(
      board.locations.reduce((acc, r) => acc + r.ordersToday, 0),
    );
    // Each row matches what DASH-001 shows at that location.
    const { asOf: _, ...main } = await api.dashboard.summary();
    expect(board.locations.find((r) => r.location.id === 'loc_01MAIN')).toMatchObject(main);
  });

  it('limits a manager to their own locations', async () => {
    await signInAs('manager@pilot.demo');
    const board = await api.dashboard.locations();
    expect(board.locations.map((r) => r.location.id).sort()).toEqual([
      'loc_01BAKERY',
      'loc_01MAIN',
    ]);
  });

  it('is closed to a cashier', async () => {
    await signInAs('cashier@pilot.demo');
    await expect(api.dashboard.locations()).rejects.toMatchObject({ status: 403 });
  });
});
