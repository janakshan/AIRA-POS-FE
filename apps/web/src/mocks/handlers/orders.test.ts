import type { ApiError } from '@rbp/api-client';
import type { SensitiveActionCode } from '@rbp/types';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { db } from '@/mocks/db';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(
  email: string,
  deviceId: string | null = 'dev_01',
  locationId = 'loc_01MAIN',
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

async function pin(code: string, action: SensitiveActionCode, reasonCode = 'MANAGER_INSTRUCTION') {
  const { verificationId } = await api.identity.verifyEmployee({ pin: code, action });
  return { verificationId, reasonCode };
}

const lkr = (rupees: number) => ({ amount: Math.round(rupees * 100), currency: 'LKR' as const });
/** 2 × Chicken Kottu (900) + 3 × Fish Bun (120) = 2,160 + 10% service = 2,376. */
const SALE = [
  { productId: 'prd_01K01', quantity: 2 },
  { productId: 'prd_01S01', quantity: 3 },
];

async function paidSale(method: 'CASH' | 'CREDIT' = 'CASH', customerId?: string) {
  const order = await api.orders.create({
    lines: SALE,
    adjustmentIds: [],
    status: 'OPEN',
    ...(customerId ? { customerId } : {}),
  });
  return api.orders.pay(order.id, method === 'CASH' ? { method, tendered: lkr(3000) } : { method });
}

describe('mock orders: POS-008 payment + POS-009 receipt', () => {
  it('prices on the server, numbers per location and refuses unsellable items', async () => {
    await signInAs('cashier@pilot.demo');
    const first = await api.orders.create({ lines: SALE, adjustmentIds: [], status: 'OPEN' });
    expect(first).toMatchObject({
      number: 'MAIN-000001',
      status: 'OPEN',
      openedByDeviceId: 'dev_01',
      totals: { subtotal: lkr(2160), serviceCharge: lkr(216), total: lkr(2376), itemCount: 5 },
    });
    expect(
      (await api.orders.create({ lines: SALE, adjustmentIds: [], status: 'OPEN' })).number,
    ).toBe('MAIN-000002');
    // Mutton Biriyani is unavailable at Main.
    expect(
      await fail(
        api.orders.create({
          lines: [{ productId: 'prd_01R06', quantity: 1 }],
          adjustmentIds: [],
          status: 'OPEN',
        }),
      ),
    ).toMatchObject({ code: 'CONFLICT', details: { productIds: ['prd_01R06'] } });
  });

  it('attaches approved adjustments once, and only active ones', async () => {
    await signInAs('cashier@pilot.demo');
    const discount = await api.pos.adjustments.create({
      kind: 'DISCOUNT',
      scope: 'ORDER',
      mode: 'PERCENT',
      value: 1000,
      verification: await pin('2222', 'pos.discount.apply'),
    });
    const order = await api.orders.create({
      lines: SALE,
      adjustmentIds: [discount.id],
      status: 'OPEN',
    });
    // 2,160 − 216 = 1,944 + 10% service 194.40 = 2,138.40
    expect(order.totals.total).toEqual(lkr(2138.4));
    expect(
      await fail(api.orders.create({ lines: SALE, adjustmentIds: [discount.id], status: 'OPEN' })),
    ).toMatchObject({ code: 'CONFLICT', details: { reason: 'ADJUSTMENT' } });

    const charge = await api.pos.adjustments.create({
      kind: 'CHARGE',
      scope: 'ORDER',
      chargeCode: 'PACKAGING',
      mode: 'FIXED',
      value: 5000,
    });
    await api.pos.adjustments.void(charge.id, { system: 'SALE_CLEARED' });
    expect(
      await fail(api.orders.create({ lines: SALE, adjustmentIds: [charge.id], status: 'OPEN' })),
    ).toMatchObject({ code: 'CONFLICT' });
  });

  it('takes cash with change, and each payment method follows its rules', async () => {
    await signInAs('cashier@pilot.demo');
    const order = await api.orders.create({ lines: SALE, adjustmentIds: [], status: 'OPEN' });
    expect(
      await fail(api.orders.pay(order.id, { method: 'CASH', tendered: lkr(2000) })),
    ).toMatchObject({
      details: { fieldErrors: { tendered: 'validation.tenderedShort' } },
    });
    const paid = await api.orders.pay(order.id, { method: 'CASH', tendered: lkr(3000) });
    expect(paid.status).toBe('PAID');
    expect(paid.payments[0]).toMatchObject({ method: 'CASH', amount: lkr(2376), change: lkr(624) });
    expect(
      await fail(api.orders.pay(order.id, { method: 'CASH', tendered: lkr(3000) })),
    ).toMatchObject({
      code: 'CONFLICT',
    });

    const card = await api.orders.create({ lines: SALE, adjustmentIds: [], status: 'OPEN' });
    expect((await api.orders.pay(card.id, { method: 'CARD' })).payments[0]!.reference).toMatch(
      /^AUTH-\d{6}$/,
    );

    const bank = await api.orders.create({ lines: SALE, adjustmentIds: [], status: 'OPEN' });
    expect(await fail(api.orders.pay(bank.id, { method: 'BANK_TRANSFER' }))).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    expect(await fail(api.orders.pay(bank.id, { method: 'CREDIT' }))).toMatchObject({
      details: { fieldErrors: { method: 'validation.creditNeedsCustomer' } },
    });

    // Credit sale raises the customer's balance (Nimal owes 2,500 already).
    await paidSale('CREDIT', 'cus_01');
    expect((await api.customers.get('cus_01')).outstanding).toEqual(lkr(2500 + 2376));
  });

  it('builds the receipt and audits print vs reprint', async () => {
    await signInAs('cashier@pilot.demo');
    const paid = await paidSale();
    const receipt = await api.orders.receipt(paid.id);
    expect(receipt).toMatchObject({
      copy: 'ORIGINAL',
      kind: 'SALE',
      number: 'MAIN-000001',
      business: { name: 'Pilot Foods & Bakery' },
      location: { name: 'Main Restaurant' },
      cashier: 'Fathima Rizvi',
      device: 'Counter POS 1',
      total: lkr(2376),
      change: lkr(624),
      footer: 'Thank you! Come again.',
    });
    expect(receipt.lines.map((l) => `${l.quantity}×${l.name}`)).toEqual([
      '2×Chicken Kottu',
      '3×Fish Bun',
    ]);
    expect(receipt.rows.map((r) => r.label)).toEqual(['Subtotal', 'Service charge (10%)']);
    // Codes let the receipt view translate fixed rows and methods (POS-009).
    expect(receipt.rows.map((r) => [r.code, r.rateBps])).toEqual([
      ['SUBTOTAL', undefined],
      ['SERVICE', 1000],
    ]);
    expect(receipt.payments).toEqual([
      expect.objectContaining({ label: 'Cash tendered', method: 'CASH', tendered: true }),
    ]);

    expect((await api.orders.print(paid.id)).copy).toBe('ORIGINAL');
    expect((await api.orders.print(paid.id)).copy).toBe('REPRINT');
    expect((await api.orders.receipt(paid.id)).copy).toBe('REPRINT');
    await signInAs('owner@pilot.demo');
    const actions = (await api.audit.list({ entityId: paid.id })).items.map((e) => e.action);
    expect(actions).toEqual(['pos.receipt.reprint', 'pos.receipt.print', 'pos.order.pay']);
  });
});

describe('mock orders: POS-010 hold / resume', () => {
  it('holds, lists and resumes on one terminal at a time', async () => {
    await signInAs('cashier@pilot.demo');
    const held = await api.orders.create({
      lines: SALE,
      adjustmentIds: [],
      status: 'HELD',
      holdLabel: 'Table 4',
    });
    expect(held).toMatchObject({ status: 'HELD', holdLabel: 'Table 4', openedByDeviceId: null });
    expect((await api.orders.list({ status: 'HELD' })).items.map((o) => o.number)).toEqual([
      held.number,
    ]);
    // Can't pay a held order without resuming it.
    expect(await fail(api.orders.pay(held.id, { method: 'CARD' }))).toMatchObject({
      code: 'CONFLICT',
    });

    expect((await api.orders.resume(held.id)).status).toBe('OPEN');
    await signInAs('manager@pilot.demo', 'dev_02');
    expect(await fail(api.orders.resume(held.id))).toMatchObject({ code: 'CONFLICT' });
  });

  it('allows additions but needs an approved item cancel for any reduction', async () => {
    await signInAs('cashier@pilot.demo');
    const held = await api.orders.create({ lines: SALE, adjustmentIds: [], status: 'HELD' });
    const open = await api.orders.resume(held.id);
    const kottu = open.lines.find((l) => l.productId === 'prd_01K01')!;

    // Silently syncing a lower quantity is refused.
    expect(
      await fail(
        api.orders.updateLines(open.id, {
          lines: [{ productId: 'prd_01K01', quantity: 1 }, SALE[1]!],
          adjustmentIds: [],
        }),
      ),
    ).toMatchObject({ code: 'VERIFICATION_REQUIRED', details: { reason: 'QUANTITY_REDUCED' } });

    // Cashiers can't cancel saved items; a manager can.
    expect(await fail(pin('3333', 'pos.item.quantity.decrease'))).toMatchObject({
      code: 'EMPLOYEE_NOT_AUTHORIZED',
    });
    const reduced = await api.orders.cancelItem(open.id, kottu.id, {
      quantity: 1,
      verification: await pin('2222', 'pos.item.quantity.decrease', 'CUSTOMER_CHANGED'),
    });
    expect(reduced.lines.find((l) => l.id === kottu.id)).toMatchObject({
      quantity: 1,
      cancelledQuantity: 1,
    });
    expect(reduced.totals.total).toEqual(lkr((900 + 360) * 1.1));

    // Additions sync freely.
    const synced = await api.orders.updateLines(open.id, {
      lines: [
        { productId: 'prd_01K01', quantity: 1 },
        SALE[1]!,
        { productId: 'prd_01D02', quantity: 2 },
      ],
      adjustmentIds: [],
    });
    expect(synced.lines.map((l) => [l.code, l.quantity])).toEqual([
      ['K01', 1],
      ['S01', 3],
      ['D02', 2],
    ]);

    // Removing a whole line needs pos.item.remove, not a decrease approval.
    const bun = synced.lines.find((l) => l.code === 'S01')!;
    expect(
      await fail(
        api.orders.cancelItem(open.id, bun.id, {
          quantity: 3,
          verification: await pin('2222', 'pos.item.quantity.decrease'),
        }),
      ),
    ).toMatchObject({ code: 'VERIFICATION_REQUIRED', details: { reason: 'ACTION_MISMATCH' } });

    await signInAs('owner@pilot.demo');
    const [event] = (await api.audit.list({ action: 'pos.item.quantity.decrease' })).items;
    expect(event).toMatchObject({
      entityLabel: expect.stringContaining('Chicken Kottu 2 → 1'),
      employee: { fullName: 'Suresh Kumar' },
      reason: { code: 'CUSTOMER_CHANGED' },
    });
  });
});

describe('mock orders: POS-011 return', () => {
  it('refunds returned units with their share of service charge, then settles the rest', async () => {
    await signInAs('cashier@pilot.demo');
    const paid = await paidSale();
    const kottu = paid.lines.find((l) => l.code === 'K01')!;
    const bun = paid.lines.find((l) => l.code === 'S01')!;

    // Cashier can't approve returns.
    expect(await fail(pin('3333', 'pos.return'))).toMatchObject({
      code: 'EMPLOYEE_NOT_AUTHORIZED',
    });
    expect(
      await fail(
        api.orders.createReturn(paid.id, {
          lines: [{ lineId: kottu.id, quantity: 3 }],
          refundMethod: 'CASH',
          verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
        }),
      ),
    ).toMatchObject({ details: { fieldErrors: { lines: 'validation.returnTooMany' } } });

    const once = await api.orders.createReturn(paid.id, {
      lines: [{ lineId: kottu.id, quantity: 1 }],
      refundMethod: 'CASH',
      verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
    });
    // One kottu: 900 + its 10% service share 90.
    expect(once.returns[0]).toMatchObject({
      number: 'RTN-MAIN-000001',
      amount: lkr(990),
      refundMethod: 'CASH',
    });
    expect(once.lines.find((l) => l.id === kottu.id)?.returnedQuantity).toBe(1);

    const rest = await api.orders.createReturn(paid.id, {
      lines: [
        { lineId: kottu.id, quantity: 1 },
        { lineId: bun.id, quantity: 3 },
      ],
      refundMethod: 'ORIGINAL',
      verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
    });
    expect(rest.returns[1]!.amount).toEqual(lkr(2376 - 990));
    const refunds = rest.payments
      .filter((p) => p.kind === 'REFUND')
      .reduce((s, p) => s + p.amount.amount, 0);
    expect(refunds).toBe(lkr(2376).amount);

    const receipt = await api.orders.returnReceipt(paid.id, rest.returns[0]!.id);
    expect(receipt).toMatchObject({
      kind: 'RETURN',
      number: 'RTN-MAIN-000001',
      originalNumber: paid.number,
      payments: [expect.objectContaining({ method: 'CASH', refund: true })],
    });
  });

  it('reduces the customer balance for credit sales and respects the return window', async () => {
    await signInAs('cashier@pilot.demo');
    const credit = await paidSale('CREDIT', 'cus_03');
    const bun = credit.lines.find((l) => l.code === 'S01')!;
    await api.orders.createReturn(credit.id, {
      lines: [{ lineId: bun.id, quantity: 1 }],
      refundMethod: 'ORIGINAL',
      verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
    });
    // 2,376 − (120 + 12 service) = 2,244 still owed.
    expect((await api.customers.get('cus_03')).outstanding).toEqual(lkr(2244));

    const old = await paidSale();
    db.update((d) => {
      const o = d.orders.find((x) => x.id === old.id)!;
      o.paidAt = new Date(Date.now() - 40 * 86_400_000).toISOString();
    });
    expect(
      await fail(
        api.orders.createReturn(old.id, {
          lines: [{ lineId: old.lines[0]!.id, quantity: 1 }],
          refundMethod: 'CASH',
          verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
        }),
      ),
    ).toMatchObject({ code: 'CONFLICT', details: { reason: 'WINDOW', days: 30 } });
  });
});

describe('mock orders: POS-012 void / cancel', () => {
  it("voids today's invoice with a manager PIN and reverses credit", async () => {
    await signInAs('cashier@pilot.demo');
    const credit = await paidSale('CREDIT', 'cus_05');
    expect(await fail(pin('3333', 'pos.invoice.void'))).toMatchObject({
      code: 'EMPLOYEE_NOT_AUTHORIZED',
    });
    const voided = await api.orders.void(credit.id, {
      verification: await pin('2222', 'pos.invoice.void', 'DUPLICATE_SALE'),
    });
    expect(voided).toMatchObject({
      status: 'VOIDED',
      cancellation: {
        approvedBy: { fullName: 'Suresh Kumar' },
        reason: { code: 'DUPLICATE_SALE' },
      },
    });
    expect(voided.payments.map((p) => [p.kind, p.status])).toEqual([
      ['SALE', 'REFUNDED'],
      ['REFUND', 'CAPTURED'],
    ]);
    expect((await api.customers.get('cus_05')).outstanding).toEqual(lkr(0));
  });

  it('refuses to void after a return or on a later day', async () => {
    await signInAs('cashier@pilot.demo');
    const returned = await paidSale();
    await api.orders.createReturn(returned.id, {
      lines: [{ lineId: returned.lines[0]!.id, quantity: 1 }],
      refundMethod: 'CASH',
      verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
    });
    expect(
      await fail(
        api.orders.void(returned.id, { verification: await pin('2222', 'pos.invoice.void') }),
      ),
    ).toMatchObject({ code: 'CONFLICT', details: { reason: 'HAS_RETURNS' } });

    const yesterday = await paidSale();
    db.update((d) => {
      d.orders.find((x) => x.id === yesterday.id)!.paidAt = new Date(
        Date.now() - 86_400_000 * 1.5,
      ).toISOString();
    });
    expect(
      await fail(
        api.orders.void(yesterday.id, { verification: await pin('2222', 'pos.invoice.void') }),
      ),
    ).toMatchObject({ code: 'CONFLICT', details: { reason: 'NOT_TODAY' } });
  });

  it('cancels a held order and voids its discounts', async () => {
    await signInAs('cashier@pilot.demo');
    const discount = await api.pos.adjustments.create({
      kind: 'DISCOUNT',
      scope: 'ORDER',
      mode: 'PERCENT',
      value: 500,
      verification: await pin('2222', 'pos.discount.apply'),
    });
    const held = await api.orders.create({
      lines: SALE,
      adjustmentIds: [discount.id],
      status: 'HELD',
    });
    const cancelled = await api.orders.cancel(held.id, {
      verification: await pin('2222', 'pos.order.cancel', 'CUSTOMER_CANCELLED'),
    });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', adjustments: [] });
    expect(db.get().adjustments.find((a) => a.id === discount.id)?.status).toBe('VOIDED');
    expect(await fail(api.orders.resume(held.id))).toMatchObject({ code: 'CONFLICT' });
  });
});

describe('mock orders: SAL-001 list filters', () => {
  it('filters by order type, payment method and an inclusive date range', async () => {
    await signInAs('manager@pilot.demo');
    const cash = await paidSale('CASH');
    const credit = await paidSale('CREDIT', 'cus_05');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const byMethod = await api.orders.list({ from: today.toISOString(), paymentMethod: 'CREDIT' });
    expect(byMethod.items.map((o) => o.id)).toContain(credit.id);
    expect(byMethod.items.map((o) => o.id)).not.toContain(cash.id);
    expect(
      byMethod.items.every((o) =>
        o.payments.some((p) => p.kind === 'SALE' && p.method === 'CREDIT'),
      ),
    ).toBe(true);

    const dineIn = await api.orders.list({ type: 'DINE_IN', pageSize: 100 });
    expect(dineIn.total).toBeGreaterThan(0);
    expect(dineIn.items.every((o) => o.type === 'DINE_IN')).toBe(true);

    // Seeded history: yesterday only, nothing from today.
    const yesterday = new Date(today.getTime() - 24 * 60 * 60_000);
    const day = await api.orders.list({
      from: yesterday.toISOString(),
      to: new Date(today.getTime() - 1).toISOString(),
      pageSize: 100,
    });
    expect(day.total).toBeGreaterThan(0);
    expect(
      day.items.every(
        (o) => o.createdAt >= yesterday.toISOString() && o.createdAt < today.toISOString(),
      ),
    ).toBe(true);
    expect(day.items.map((o) => o.id)).not.toContain(cash.id);
  });
});
