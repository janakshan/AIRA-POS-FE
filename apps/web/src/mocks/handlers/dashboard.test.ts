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
