import type { ApiError } from '@rbp/api-client';
import type { SensitiveActionCode } from '@rbp/types';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(email: string, deviceId: string | null = 'dev_01') {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation('loc_01MAIN');
  useSessionStore.getState().setDevice(deviceId);
}

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ApiError) => e,
  );

async function pin(code: string, action: SensitiveActionCode, reasonCode = 'MANAGER_INSTRUCTION') {
  const { verificationId } = await api.identity.verifyEmployee({ pin: code, action });
  return { verificationId, reasonCode };
}

const lkr = (rupees: number) => ({ amount: Math.round(rupees * 100), currency: 'LKR' as const });

/** Kottu → Kitchen, Milk Tea → Bar, Fish Bun → no station (counter item). */
const ROUND_1 = [
  { productId: 'prd_01K01', quantity: 2, note: 'Less spicy' },
  { productId: 'prd_01D02', quantity: 1 },
  { productId: 'prd_01S01', quantity: 3 },
];

const dineIn = (tableId = 'tbl_T4') =>
  api.orders.create({
    lines: ROUND_1,
    adjustmentIds: [],
    status: 'OPEN',
    type: 'DINE_IN',
    tableId,
  });

const tableOf = async (name: string) => (await api.tables.list()).find((t) => t.name === name)!;

describe('mock restaurant: REST-001 tables', () => {
  it('lists tables by area and derives their state from open orders', async () => {
    await signInAs('waiter@pilot.demo');
    const tables = await api.tables.list();
    expect(tables).toHaveLength(15);
    expect(new Set(tables.map((t) => t.area))).toEqual(new Set(['Indoor', 'Outdoor', 'Bar']));
    expect(tables.every((t) => t.status === 'FREE')).toBe(true);

    const order = await dineIn();
    expect(order).toMatchObject({ type: 'DINE_IN', table: { id: 'tbl_T4', name: 'T4' } });
    expect(order.lines.map((l) => l.sentQuantity)).toEqual([0, 0, 0]);
    expect(await tableOf('T4')).toMatchObject({
      status: 'OCCUPIED',
      // Fish Bun has no kitchen station, so only Kottu ×2 and Milk Tea ×1 are waiting to be sent.
      order: { id: order.id, itemCount: 6, unsent: 3 },
    });

    // One order per table.
    expect(await fail(dineIn())).toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'TABLE_OCCUPIED' },
    });
    // Dine-in needs a table.
    expect(
      await fail(
        api.orders.create({ lines: ROUND_1, adjustmentIds: [], status: 'OPEN', type: 'DINE_IN' }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('prints the bill (BILLING), and paying frees the table', async () => {
    await signInAs('cashier@pilot.demo');
    const order = await dineIn('tbl_O1');
    await api.orders.bill(order.id);
    expect((await tableOf('O1')).status).toBe('BILLING');
    const bill = await api.orders.receipt(order.id);
    expect(bill).toMatchObject({ copy: 'BILL', orderType: 'DINE_IN', table: 'O1' });

    await api.orders.pay(order.id, { method: 'CASH', tendered: lkr(5000) });
    expect(await tableOf('O1')).toMatchObject({ status: 'FREE', order: null });
  });

  it('transfers a table with a manager PIN, and the kitchen tickets follow', async () => {
    await signInAs('waiter@pilot.demo');
    const order = await dineIn('tbl_T1');
    await api.orders.sendToKitchen(order.id);
    await dineIn('tbl_T2');

    // Waiters can't approve transfers; the target must be free.
    expect(await fail(pin('4444', 'restaurant.table.transfer'))).toMatchObject({
      code: 'EMPLOYEE_NOT_AUTHORIZED',
    });
    expect(
      await fail(
        api.tables.transfer('tbl_T1', {
          toTableId: 'tbl_T2',
          verification: await pin('2222', 'restaurant.table.transfer'),
        }),
      ),
    ).toMatchObject({ details: { reason: 'TABLE_OCCUPIED' } });

    const moved = await api.tables.transfer('tbl_T1', {
      toTableId: 'tbl_B1',
      verification: await pin('2222', 'restaurant.table.transfer', 'CUSTOMER_REQUEST'),
    });
    expect(moved.table).toEqual({ id: 'tbl_B1', name: 'B1' });
    expect((await tableOf('T1')).status).toBe('FREE');
    expect((await tableOf('B1')).order?.id).toBe(order.id);
    expect(
      (await api.kots.list()).filter((k) => k.orderId === order.id).map((k) => k.table),
    ).toEqual(['B1', 'B1']);

    await signInAs('owner@pilot.demo');
    const [event] = (await api.audit.list({ action: 'restaurant.table.transfer' })).items;
    expect(event).toMatchObject({
      entityLabel: expect.stringContaining('T1 → B1'),
      employee: { fullName: 'Suresh Kumar' },
    });
  });
});

describe('mock restaurant: KOT', () => {
  it('sends one KOT per station, and each round only the new items', async () => {
    await signInAs('waiter@pilot.demo');
    const order = await dineIn();
    const { order: sent, kots } = await api.orders.sendToKitchen(order.id);
    expect(sent.lines.map((l) => [l.code, l.sentQuantity])).toEqual([
      ['K01', 2],
      ['D02', 1],
      ['S01', 3],
    ]);
    expect(
      kots.map((k) => [k.stationName, k.items.map((i) => [i.name, i.quantity, i.note])]),
    ).toEqual([
      ['Main Kitchen', [['Chicken Kottu', 2, 'Less spicy']]],
      ['Beverage Bar', [['Milk Tea', 1, undefined]]],
    ]);
    expect(kots[0]).toMatchObject({
      number: 'KOT-MAIN-000001',
      kind: 'SEND',
      orderType: 'DINE_IN',
      table: 'T4',
      status: 'NEW',
      createdBy: 'Kasun Perera',
    });

    // Nothing new → refused.
    expect(await fail(api.orders.sendToKitchen(order.id))).toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'NOTHING_TO_SEND' },
    });

    // Round 2: one more kottu goes as a new ticket.
    await api.orders.updateLines(order.id, {
      lines: [{ ...ROUND_1[0]!, quantity: 3 }, ROUND_1[1]!, ROUND_1[2]!],
      adjustmentIds: [],
    });
    expect((await tableOf('T4')).order?.unsent).toBe(1);
    const round2 = await api.orders.sendToKitchen(order.id);
    expect(round2.kots).toHaveLength(1);
    expect(round2.kots[0]).toMatchObject({
      number: 'KOT-MAIN-000003',
      items: [{ name: 'Chicken Kottu', quantity: 1 }],
    });
  });

  it('moves tickets NEW → PREPARING → READY → COMPLETED for kitchen staff only', async () => {
    await signInAs('waiter@pilot.demo');
    const order = await dineIn();
    const {
      kots: [kitchen],
    } = await api.orders.sendToKitchen(order.id);
    // Waiters can see the board but not work it.
    expect(await fail(api.kots.start(kitchen!.id))).toMatchObject({ code: 'FORBIDDEN' });

    await signInAs('kitchen@pilot.demo', null);
    expect((await api.kots.list({ stationId: 'st_01KITCHEN' })).map((k) => k.id)).toEqual([
      kitchen!.id,
    ]);
    expect(await fail(api.kots.complete(kitchen!.id))).toMatchObject({ code: 'CONFLICT' });
    expect(await api.kots.start(kitchen!.id)).toMatchObject({
      status: 'PREPARING',
      startedAt: expect.any(String),
    });
    expect(await api.kots.ready(kitchen!.id)).toMatchObject({ status: 'READY' });
    expect(await api.kots.complete(kitchen!.id)).toMatchObject({ status: 'COMPLETED' });
    expect((await api.kots.list()).some((k) => k.id === kitchen!.id)).toBe(false);
    expect(
      (await api.kots.list({ includeCompleted: true })).some((k) => k.id === kitchen!.id),
    ).toBe(true);
  });

  it('cancelling sent food needs a disposition and sends a CANCEL ticket (SCN-004)', async () => {
    await signInAs('waiter@pilot.demo');
    const order = await dineIn();
    const { order: sent } = await api.orders.sendToKitchen(order.id);
    const kottu = sent.lines.find((l) => l.code === 'K01')!;

    expect(
      await fail(
        api.orders.cancelItem(order.id, kottu.id, {
          quantity: 1,
          verification: await pin('2222', 'pos.item.quantity.decrease', 'CUSTOMER_CHANGED'),
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });

    const after = await api.orders.cancelItem(order.id, kottu.id, {
      quantity: 1,
      disposition: 'STAFF_MEAL',
      verification: await pin('2222', 'pos.item.quantity.decrease', 'CUSTOMER_CHANGED'),
    });
    expect(after.lines.find((l) => l.id === kottu.id)).toMatchObject({
      quantity: 1,
      sentQuantity: 1,
    });
    const cancel = (await api.kots.list()).find((k) => k.kind === 'CANCEL')!;
    expect(cancel).toMatchObject({
      stationName: 'Main Kitchen',
      items: [{ name: 'Chicken Kottu', quantity: 1, disposition: 'STAFF_MEAL' }],
    });

    // Unsent items cancel without a disposition or a ticket.
    const bun = after.lines.find((l) => l.code === 'S01')!;
    await api.orders.updateLines(order.id, {
      lines: [
        { productId: 'prd_01K01', quantity: 1, note: 'Less spicy' },
        ROUND_1[1]!,
        { productId: 'prd_01S01', quantity: 3 },
        { productId: 'prd_01K02', quantity: 1 },
      ],
      adjustmentIds: [],
    });
    const fresh = (await api.orders.get(order.id)).lines.find((l) => l.productId === 'prd_01K02')!;
    await api.orders.cancelItem(order.id, fresh.id, {
      quantity: 1,
      verification: await pin('2222', 'pos.item.remove'),
    });
    expect((await api.kots.list()).filter((k) => k.kind === 'CANCEL')).toHaveLength(1);
    expect(bun.sentQuantity).toBe(3);

    // CANCEL tickets are acknowledged straight away.
    await signInAs('kitchen@pilot.demo', null);
    expect(await api.kots.complete(cancel.id)).toMatchObject({ status: 'COMPLETED' });
  });

  it('cancelling a whole order with sent food needs one disposition for it all (A-230)', async () => {
    await signInAs('waiter@pilot.demo');
    const order = await dineIn();
    const { order: sent } = await api.orders.sendToKitchen(order.id);
    // Fish Bun has no station: it never reached the kitchen, so no disposition for it.
    const bun = sent.lines.find((l) => l.code === 'S01')!;
    await api.orders.cancelItem(order.id, bun.id, {
      quantity: 1,
      verification: await pin('2222', 'pos.item.quantity.decrease', 'CUSTOMER_CHANGED'),
    });

    expect(
      await fail(
        api.orders.cancel(order.id, {
          verification: await pin('2222', 'pos.order.cancel', 'CUSTOMER_CANCELLED'),
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(
      await api.orders.cancel(order.id, {
        disposition: 'WASTAGE',
        verification: await pin('2222', 'pos.order.cancel', 'CUSTOMER_CANCELLED'),
      }),
    ).toMatchObject({ status: 'CANCELLED' });
    const cancels = (await api.kots.list()).filter((k) => k.kind === 'CANCEL');
    expect(cancels.flatMap((k) => k.items.map((i) => [i.name, i.quantity, i.disposition]))).toEqual(
      expect.arrayContaining([
        ['Chicken Kottu', 2, 'WASTAGE'],
        ['Milk Tea', 1, 'WASTAGE'],
      ]),
    );
    expect(cancels.flatMap((k) => k.items)).toHaveLength(2);
  });
});

describe('mock restaurant: takeaway and delivery', () => {
  it('delivery needs an address, becomes PREPARING when sent and READY when the kitchen is done', async () => {
    await signInAs('cashier@pilot.demo');
    const base = { lines: ROUND_1, adjustmentIds: [], status: 'OPEN' as const };
    expect(await fail(api.orders.create({ ...base, type: 'DELIVERY' }))).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const order = await api.orders.create({
      ...base,
      type: 'DELIVERY',
      delivery: { address: '12 Galle Road, Colombo 3', phone: '0771234567' },
    });
    expect(order.delivery).toMatchObject({ status: 'NEW', phone: '0771234567' });

    // The address is remembered on the customer for next time.
    await api.orders.create({
      ...base,
      type: 'DELIVERY',
      customerId: 'cus_03',
      delivery: { address: '7 Hill Street, Kandy', phone: '0773456789' },
    });
    expect((await api.customers.get('cus_03')).deliveryAddress).toBe('7 Hill Street, Kandy');

    const { order: sent, kots } = await api.orders.sendToKitchen(order.id);
    expect(sent.delivery?.status).toBe('PREPARING');
    expect(kots.every((k) => k.orderType === 'DELIVERY' && k.table === null)).toBe(true);

    await signInAs('kitchen@pilot.demo', null);
    await api.kots.ready(kots[0]!.id);
    await signInAs('cashier@pilot.demo');
    expect((await api.orders.get(order.id)).delivery?.status).toBe('PREPARING');
    await signInAs('kitchen@pilot.demo', null);
    await api.kots.ready(kots[1]!.id);

    await signInAs('cashier@pilot.demo');
    expect((await api.orders.get(order.id)).delivery?.status).toBe('READY');
    // Forward only.
    expect(await fail(api.orders.deliveryStatus(order.id, { status: 'PREPARING' }))).toMatchObject({
      code: 'CONFLICT',
    });
    // DEL-003: it can't leave without a rider.
    expect(
      await fail(api.orders.deliveryStatus(order.id, { status: 'OUT_FOR_DELIVERY' })),
    ).toMatchObject({ code: 'CONFLICT', details: { reason: 'RIDER_REQUIRED' } });
    await api.orders.deliveryAssign(order.id, { riderId: 'emp_10' });
    expect(
      (await api.orders.deliveryStatus(order.id, { status: 'OUT_FOR_DELIVERY' })).delivery?.status,
    ).toBe('OUT_FOR_DELIVERY');
  });

  it('takeaway sends to the kitchen without a table; retail stays retail', async () => {
    await signInAs('cashier@pilot.demo');
    const takeaway = await api.orders.create({
      lines: ROUND_1,
      adjustmentIds: [],
      status: 'OPEN',
      type: 'TAKEAWAY',
    });
    expect(takeaway).toMatchObject({ type: 'TAKEAWAY', table: null, delivery: null });
    expect((await api.orders.sendToKitchen(takeaway.id)).kots).toHaveLength(2);

    // Paying a takeaway sends whatever the kitchen hasn't seen yet.
    const quick = await api.orders.create({
      lines: ROUND_1,
      adjustmentIds: [],
      status: 'OPEN',
      type: 'TAKEAWAY',
    });
    const paid = await api.orders.pay(quick.id, { method: 'CARD' });
    expect(paid.lines.every((l) => l.sentQuantity === l.quantity)).toBe(true);
    expect((await api.kots.list()).filter((k) => k.orderId === quick.id)).toHaveLength(2);

    const retail = await api.orders.create({ lines: ROUND_1, adjustmentIds: [], status: 'OPEN' });
    expect(retail.type).toBe('RETAIL');
  });

  it('is off for tenants without the restaurant features', async () => {
    const { accessToken } = await api.auth.login({
      email: 'cashier@grocery.demo',
      password: 'demo1234',
    });
    useSessionStore.getState().signIn(accessToken);
    useSessionStore.getState().setLocation('loc_02TOWN');
    expect(await fail(api.tables.list())).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
    expect(await fail(api.kots.list())).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
  });
});
