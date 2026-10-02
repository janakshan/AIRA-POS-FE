import type { ApiError } from '@rbp/api-client';
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

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ApiError) => e,
  );

const RIDER = 'emp_10';
const byNumber = async (number: string) =>
  (await api.deliveries.list()).find((o) => o.number === number)!;
const onHand = async (productId: string) =>
  (await api.inventory.get(productId)).levels.find((l) => l.locationId === 'loc_01MAIN')!.onHand;

describe('mock delivery: DEL-001 board and seeded day (SCN-009)', () => {
  it("lists today's deliveries with charge, rider and timeline", async () => {
    await signInAs('cashier@pilot.demo');
    const list = await api.deliveries.list();
    expect(list.map((o) => o.delivery?.status)).toEqual(
      expect.arrayContaining(['NEW', 'CONFIRMED', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED']),
    );
    const out = list.find((o) => o.delivery?.status === 'OUT_FOR_DELIVERY')!;
    expect(out).toMatchObject({
      status: 'OPEN',
      delivery: { riderName: 'Sameera Bandara', instructions: 'Gate code 2468' },
    });
    expect(out.totals.charges[0]).toMatchObject({ code: 'DELIVERY', amount: { amount: 25_000 } });
    expect(out.delivery?.history?.map((h) => h.status)).toEqual([
      'NEW',
      'CONFIRMED',
      'PREPARING',
      'READY',
      'OUT_FOR_DELIVERY',
    ]);
    const riders = await api.deliveries.riders();
    expect(riders).toEqual([
      expect.objectContaining({ id: RIDER, fullName: 'Sameera Bandara', outNow: 1 }),
    ]);
  });
});

describe('mock delivery: FLOW-DEL-001 New → Delivered', () => {
  it('confirms, sends to the kitchen, assigns, and collects at the door', async () => {
    await signInAs('cashier@pilot.demo');
    const order = await byNumber('PH-MAIN-0001');
    expect(order.delivery?.status).toBe('NEW');

    let o = await api.orders.deliveryStatus(order.id, { status: 'CONFIRMED' });
    expect(o.delivery?.status).toBe('CONFIRMED');
    // Preparing sends it to the kitchen.
    o = await api.orders.deliveryStatus(order.id, { status: 'PREPARING' });
    expect(o.lines.every((l) => l.sentQuantity === l.quantity)).toBe(true);
    const kots = await api.kots.list();
    expect(kots.some((k) => k.orderId === order.id)).toBe(true);
    await api.orders.deliveryStatus(order.id, { status: 'READY' });

    // Needs a rider to leave.
    expect(
      await fail(api.orders.deliveryStatus(order.id, { status: 'OUT_FOR_DELIVERY' })),
    ).toMatchObject({ details: { reason: 'RIDER_REQUIRED' } });
    o = await api.orders.deliveryAssign(order.id, { riderId: RIDER });
    expect(o.delivery).toMatchObject({ riderId: RIDER, riderName: 'Sameera Bandara' });

    const kottu = await onHand('prd_01K01');
    // The rider takes it out and delivers it, collecting cash.
    await signInAs('rider@pilot.demo', 'loc_01MAIN', null);
    await api.orders.deliveryStatus(order.id, { status: 'OUT_FOR_DELIVERY' });
    expect(await fail(api.orders.deliveryStatus(order.id, { status: 'DELIVERED' }))).toMatchObject({
      details: { reason: 'PAYMENT_REQUIRED' },
    });
    o = await api.orders.deliveryStatus(order.id, {
      status: 'DELIVERED',
      payment: { method: 'CASH', tendered: { amount: 500_000, currency: 'LKR' } },
    });
    expect(o).toMatchObject({ status: 'PAID', delivery: { status: 'DELIVERED' } });
    expect(o.payments[0]).toMatchObject({ method: 'CASH', createdBy: 'Sameera Bandara' });
    expect(o.delivery?.history?.at(-1)).toMatchObject({
      status: 'DELIVERED',
      by: 'Sameera Bandara',
    });
    // Paying at the door is when the sale leaves stock.
    await signInAs('cashier@pilot.demo');
    expect(await onHand('prd_01K01')).toBe(kottu - 2);
  });

  it('keeps riders to their own deliveries and the dispatch steps to the counter', async () => {
    await signInAs('rider@pilot.demo', 'loc_01MAIN', null);
    const mine = await api.deliveries.list();
    expect(mine.every((o) => o.delivery?.riderId === RIDER)).toBe(true);
    await signInAs('cashier@pilot.demo');
    const confirmed = await byNumber('PH-MAIN-0002');
    await signInAs('rider@pilot.demo', 'loc_01MAIN', null);
    expect(
      await fail(api.orders.deliveryStatus(confirmed.id, { status: 'PREPARING' })),
    ).toMatchObject({ code: 'FORBIDDEN' });
    expect(await fail(api.orders.deliveryAssign(confirmed.id, { riderId: RIDER }))).toMatchObject({
      code: 'FORBIDDEN',
    });
    // A waiter can't dispatch.
    await signInAs('waiter@pilot.demo');
    expect(await fail(api.deliveries.list())).toMatchObject({ code: 'FORBIDDEN' });
    // Grocery tenant has no delivery.
    await signInAs('owner@grocery.demo', 'loc_02TOWN', 'dev_06');
    expect(await fail(api.deliveries.list())).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
  });

  it('cancelling the order cancels the delivery', async () => {
    await signInAs('cashier@pilot.demo');
    const order = await byNumber('PH-MAIN-0002');
    const { verificationId } = await api.identity.verifyEmployee({
      pin: '2222',
      action: 'pos.order.cancel',
    });
    const cancelled = await api.orders.cancel(order.id, {
      verification: { verificationId, reasonCode: 'CUSTOMER_CANCELLED' },
    });
    expect(cancelled.delivery?.status).toBe('CANCELLED');
    expect(cancelled.delivery?.history?.at(-1)?.status).toBe('CANCELLED');
    expect(await fail(api.orders.deliveryStatus(order.id, { status: 'PREPARING' }))).toMatchObject({
      code: 'CONFLICT',
    });
  });
});
