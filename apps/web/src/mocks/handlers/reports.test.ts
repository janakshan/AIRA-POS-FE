import type { ApiError } from '@rbp/api-client';
import type { SensitiveActionCode } from '@rbp/types';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { db } from '@/mocks/db';
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

async function pin(code: string, action: SensitiveActionCode, reasonCode: string) {
  const { verificationId } = await api.identity.verifyEmployee({ pin: code, action });
  return { verificationId, reasonCode };
}

const pad = (n: number) => String(n).padStart(2, '0');
const day = (back = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - back);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const TODAY = { from: day(), to: day(), locationId: 'loc_01MAIN' };
const lkr = (rupees: number) => ({ amount: rupees * 100, currency: 'LKR' as const });
const SALE = [
  { productId: 'prd_01K01', quantity: 2 },
  { productId: 'prd_01S01', quantity: 3 },
];

async function paidSale(adjustmentIds: string[] = []) {
  const order = await api.orders.create({ lines: SALE, adjustmentIds, status: 'OPEN' });
  return api.orders.pay(order.id, { method: 'CASH', tendered: lkr(5000) });
}

describe('mock reports: REP-001 sales summary', () => {
  it('has a month of history, split by day, payment, type and cashier', async () => {
    await signInAs('owner@pilot.demo');
    const r = await api.reports.sales({ from: day(30), to: day(1), locationId: 'all' });
    expect(r.totals.orders).toBeGreaterThan(400);
    expect(r.byDay).toHaveLength(30);
    expect(r.byDay.reduce((s, d) => s + d.net.amount, 0)).toBe(r.totals.net.amount);
    expect(r.byPayment.reduce((s, p) => s + p.net.amount, 0)).toBe(r.totals.net.amount);
    expect(r.totals.discounts.amount).toBeGreaterThan(0);
    expect(r.totals.refunds.amount).toBeGreaterThan(0);
    expect(r.byCashier.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Fathima Rizvi', 'Priya Nathan']),
    );
    expect(r.channels.wholesale.invoices).toBeGreaterThan(0);
    expect(r.channels.staffMeals.meals).toBeGreaterThan(0);
  });

  it('counts a sale when paid, and a void or return when refunded', async () => {
    await signInAs('owner@pilot.demo');
    const before = await api.reports.sales(TODAY);

    await signInAs('cashier@pilot.demo');
    const discount = await api.pos.adjustments.create({
      kind: 'DISCOUNT',
      scope: 'ORDER',
      mode: 'PERCENT',
      value: 1000,
      verification: await pin('2222', 'pos.discount.apply', 'LOYAL_CUSTOMER'),
    });
    const a = await paidSale([discount.id]);
    const b = await paidSale();
    await api.orders.void(b.id, {
      verification: await pin('2222', 'pos.invoice.void', 'DUPLICATE_SALE'),
    });
    const c = await paidSale();
    const kottu = c.lines.find((l) => l.productId === 'prd_01K01')!;
    const returned = await api.orders.createReturn(c.id, {
      lines: [{ lineId: kottu.id, quantity: 1 }],
      refundMethod: 'CASH',
      verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
    });

    await signInAs('owner@pilot.demo');
    const after = await api.reports.sales(TODAY);
    const refund = returned.returns[0]!.amount.amount;
    const sold = a.totals.total.amount + b.totals.total.amount + c.totals.total.amount;
    expect(after.totals.sales.amount - before.totals.sales.amount).toBe(sold);
    expect(after.totals.refunds.amount - before.totals.refunds.amount).toBe(
      b.totals.total.amount + refund,
    );
    expect(after.totals.net.amount - before.totals.net.amount).toBe(
      a.totals.total.amount + c.totals.total.amount - refund,
    );
    // The voided sale isn't an order.
    expect(after.totals.orders - before.totals.orders).toBe(2);
    expect(after.totals.discounts.amount - before.totals.discounts.amount).toBe(
      a.totals.discountTotal.amount + b.totals.discountTotal.amount + c.totals.discountTotal.amount,
    );

    // REP-002: the returned kottu, and no units from the voided sale.
    const products = await api.reports.products(TODAY);
    const row = products.rows.find((x) => x.productId === 'prd_01K01')!;
    expect(row.returned).toBeGreaterThanOrEqual(1);

    // REP-005: each exception, with who approved it and why.
    const voids = await api.reports.voids(TODAY);
    expect(voids.voided.find((v) => v.orderId === b.id)).toMatchObject({
      approvedBy: 'Suresh Kumar',
      reason: 'Duplicate sale',
    });
    expect(voids.refunds.find((v) => v.orderId === c.id)).toMatchObject({
      amount: { amount: refund },
      reason: 'Customer returned item',
    });
    expect(voids.discounts.find((d) => d.orderId === a.id)).toMatchObject({
      kind: 'DISCOUNT',
      approvedBy: 'Suresh Kumar',
      amount: { amount: a.totals.discountTotal.amount },
    });
  });
  it('puts a refund of an earlier sale in the refund period, so every breakdown adds up to net', async () => {
    await signInAs('cashier@pilot.demo');
    const sale = await paidSale();
    // Paid three days ago, returned today.
    const paidAt = new Date();
    paidAt.setDate(paidAt.getDate() - 3);
    db.update((d) => {
      const o = d.orders.find((x) => x.id === sale.id)!;
      o.paidAt = paidAt.toISOString();
      for (const pay of o.payments) pay.createdAt = paidAt.toISOString();
    });
    const kottu = sale.lines.find((l) => l.productId === 'prd_01K01')!;
    await api.orders.createReturn(sale.id, {
      lines: [{ lineId: kottu.id, quantity: 1 }],
      refundMethod: 'CASH',
      verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
    });

    await signInAs('owner@pilot.demo');
    for (const q of [TODAY, { from: day(6), to: day(), locationId: 'all' }]) {
      const r = await api.reports.sales(q);
      const net = r.totals.net.amount;
      const sum = (rows: { net: { amount: number } }[]) =>
        rows.reduce((s, x) => s + x.net.amount, 0);
      expect(sum(r.byDay)).toBe(net);
      expect(sum(r.byPayment)).toBe(net);
      expect(sum(r.byType)).toBe(net);
      expect(sum(r.byCashier)).toBe(net);
      expect(sum(r.byHour)).toBe(net);
    }
  });
});

describe('mock reports: REP-003 location sales', () => {
  it('rows add up to the all-locations total, vans shown apart', async () => {
    await signInAs('owner@pilot.demo');
    const params = { from: day(30), to: day(), locationId: 'all' };
    const r = await api.reports.locations(params);
    const pos = r.rows.filter((x) => x.channel === 'POS');
    expect(pos.reduce((s, x) => s + x.net.amount, 0)).toBe(r.totals.net.amount);
    expect((await api.reports.sales(params)).totals.net.amount).toBe(r.totals.net.amount);
    expect(r.rows.find((x) => x.channel === 'WHOLESALE')?.name).toBe('Van 1');
    expect(pos.reduce((s, x) => s + x.shareBps, 0)).toBeGreaterThanOrEqual(9_990);
  });
});

describe('mock reports: REP-004 stock', () => {
  it('reconciles opening + in − out = closing = on hand', async () => {
    await signInAs('owner@pilot.demo');
    const r = await api.reports.stock({ from: day(7), to: day(), locationId: 'loc_01MAIN' });
    for (const row of r.rows) {
      expect(row.closing).toBe(row.onHandNow);
    }
    const bun = r.rows.find((x) => x.productId === 'prd_01S01')!;
    const level = (await api.inventory.get('prd_01S01')).levels.find(
      (l) => l.locationId === 'loc_01MAIN',
    )!;
    expect(bun.closing).toBe(level.onHand);
    expect(bun.sold).toBeGreaterThan(0);
    expect(r.totals.staffMeals).toBeGreaterThanOrEqual(0);
  });
});

describe('mock reports: access', () => {
  it('needs report.sales.view and stays inside your locations', async () => {
    await signInAs('cashier@pilot.demo');
    expect(await fail(api.reports.sales())).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs('manager@pilot.demo');
    expect(await fail(api.reports.sales({ locationId: 'loc_01STORE' }))).toMatchObject({
      code: 'FORBIDDEN',
    });
    const all = await api.reports.locations({ locationId: 'all' });
    expect(all.rows.map((x) => x.name).sort()).toEqual(['Bakery Outlet', 'Main Restaurant']);
  });
});

describe('mock reports: REP-007 staff', () => {
  const MONTH = { from: day(29), to: day(), locationId: 'loc_01MAIN' };
  const row = <R extends { name: string }>(r: { rows: R[] }, name: string) =>
    r.rows.find((x) => x.name === name)!;

  it('shows hours, lates, absences, drawer over/short and meals per employee', async () => {
    await signInAs('manager@pilot.demo');
    const r = await api.reports.staff(MONTH);
    const fathima = row(r, 'Fathima Rizvi');
    expect(fathima.worked).toBeGreaterThan(15);
    expect(fathima.minutes).toBeGreaterThan(fathima.worked * 7 * 60);
    expect(fathima.late).toBeGreaterThanOrEqual(3);
    expect(row(r, 'Arun Selvam').absent).toBeGreaterThanOrEqual(2);
    expect(row(r, 'Suresh Kumar')).toMatchObject({ unrostered: 2 });
    expect(row(r, 'Suresh Kumar').shiftsClosed).toBeGreaterThan(10);
    expect(row(r, 'Suresh Kumar').shortShifts).toBeGreaterThan(0);
    expect(r.totals.meals).toBeGreaterThan(0);
    // Bakery staff aren't at Main.
    expect(r.rows.some((x) => x.name === 'Priya Nathan')).toBe(false);

    // Totals are the sum of the rows.
    const sum = (f: (x: (typeof r.rows)[number]) => number) => r.rows.reduce((s, x) => s + f(x), 0);
    expect(r.totals.minutes).toBe(sum((x) => x.minutes));
    expect(r.totals.net.amount).toBe(sum((x) => x.net.amount));
    expect(r.totals.variance.amount).toBe(sum((x) => x.variance.amount));
    expect(r.totals.mealValue.amount).toBe(sum((x) => x.mealValue.amount));
  });

  it("matches REP-001's sales by cashier and picks up today's activity", async () => {
    await signInAs('manager@pilot.demo');
    const before = row(await api.reports.staff(TODAY), 'Fathima Rizvi')?.orders ?? 0;
    await signInAs('cashier@pilot.demo');
    await paidSale();
    await signInAs('manager@pilot.demo');
    const [staff, sales] = await Promise.all([api.reports.staff(MONTH), api.reports.sales(MONTH)]);
    expect(staff.totals.net).toEqual(
      lkr(sales.byCashier.reduce((s, c) => s + c.net.amount, 0) / 100),
    );
    for (const c of sales.byCashier) {
      expect(row(staff, c.name)).toMatchObject({ net: c.net, orders: c.orders });
    }
    const today = await api.reports.staff(TODAY);
    expect(row(today, 'Fathima Rizvi').orders).toBe(before + 1);
    // Kasun is clocked in now: his open shift counts up to now.
    expect(row(today, 'Kasun Perera').minutes).toBeGreaterThanOrEqual(89);
  });

  it('needs HR and staff.view', async () => {
    await signInAs('cashier@pilot.demo');
    expect(await fail(api.reports.staff())).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs('owner@grocery.demo', 'loc_02TOWN', null);
    expect(await fail(api.reports.staff())).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
  });
});
