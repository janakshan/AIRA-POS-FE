import type {
  LocationSalesRow,
  Money,
  OrderType,
  PaymentMethod,
  ProductSalesRow,
  SalesFigures,
  StockReportRow,
  VoidsReport,
} from '@rbp/types';
import type { MockContext } from './context';
import { db } from './db';
import type { MockDb } from './db/seed';
import { minStockOf, statusOf, trackedPairs } from './inventory';
import type { OrderRecord } from './handlers/orders';
import { invoiceView } from './wholesale';

/**
 * REP-* definitions in one place (A-287…):
 * - A sale is a PAID or VOIDED order, recognised on the local day it was paid.
 * - Refunds (returns and voids) count on the day the money went back.
 * - net = sales − refunds; orders = paid orders that weren't voided.
 * - Cancelled orders were never sales (REP-005 only). Wholesale and staff meals are channels.
 */

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d: Date | string) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

export interface Period {
  from: string;
  to: string;
  days: string[];
  /** ISO bounds. */
  start: string;
  end: string;
}

/** Inclusive local-date range; default the last 7 days. */
export function periodOf(url: URL): Period {
  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  const valid = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  let from = valid(url.searchParams.get('from')) ?? localDate(weekAgo);
  let to = valid(url.searchParams.get('to')) ?? localDate(today);
  if (from > to) [from, to] = [to, from];
  const at = (d: string, end: boolean) => {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(
      y ?? 1970,
      (m ?? 1) - 1,
      day ?? 1,
      end ? 23 : 0,
      end ? 59 : 0,
      end ? 59 : 0,
      end ? 999 : 0,
    );
  };
  const days: string[] = [];
  for (
    let d = at(from, false);
    d <= at(to, false) && days.length < 366;
    d.setDate(d.getDate() + 1)
  ) {
    days.push(localDate(d));
  }
  return { from, to, days, start: at(from, false).toISOString(), end: at(to, true).toISOString() };
}

const inPeriod = (iso: string | undefined, p: Period) => !!iso && iso >= p.start && iso <= p.end;

export const money = (ctx: MockContext, amount: number): Money => ({
  amount,
  currency: ctx.me.tenant.currency,
});

export const ordersAt = (ctx: MockContext, locationIds: string[]) =>
  db
    .get()
    .orders.filter(
      (o) => o.tenantId === ctx.me.tenant.id && locationIds.includes(o.locationId),
    ) as OrderRecord[];

/** Orders whose sale falls in the period. */
export const salesIn = (orders: OrderRecord[], p: Period) =>
  orders.filter((o) => (o.status === 'PAID' || o.status === 'VOIDED') && inPeriod(o.paidAt, p));

/** Refund payments made in the period (returns and voids). */
export const refundsIn = (orders: OrderRecord[], p: Period) =>
  orders.flatMap((o) =>
    o.payments
      .filter((pay) => pay.kind === 'REFUND' && inPeriod(pay.createdAt, p))
      .map((pay) => ({ order: o, payment: pay })),
  );

export function figures(ctx: MockContext, orders: OrderRecord[], p: Period): SalesFigures {
  const sold = salesIn(orders, p);
  const refunds = refundsIn(orders, p).reduce((s, r) => s + r.payment.amount.amount, 0);
  const sum = (f: (o: OrderRecord) => number) => sold.reduce((s, o) => s + f(o), 0);
  const sales = sum((o) => o.totals.total.amount);
  const counted = sold.filter((o) => o.status === 'PAID');
  const net = sales - refunds;
  return {
    gross: money(
      ctx,
      sum((o) => o.totals.subtotal.amount),
    ),
    discounts: money(
      ctx,
      sum((o) => o.totals.discountTotal.amount),
    ),
    charges: money(
      ctx,
      sum(
        (o) =>
          o.totals.serviceCharge.amount + o.totals.charges.reduce((n, c) => n + c.amount.amount, 0),
      ),
    ),
    tax: money(
      ctx,
      sum((o) => o.totals.tax.amount),
    ),
    sales: money(ctx, sales),
    refunds: money(ctx, refunds),
    net: money(ctx, net),
    orders: counted.length,
    items: counted.reduce(
      (s, o) => s + o.lines.reduce((n, l) => n + l.quantity - l.returnedQuantity, 0),
      0,
    ),
    averageOrder: money(ctx, counted.length ? Math.round(net / counted.length) : 0),
  };
}

/** Net per local day (sales on the paid day − refunds on the refund day). */
export function netByDay(orders: OrderRecord[], p: Period) {
  const net = new Map(p.days.map((d) => [d, 0]));
  const count = new Map(p.days.map((d) => [d, 0]));
  for (const o of salesIn(orders, p)) {
    const d = localDate(o.paidAt!);
    net.set(d, (net.get(d) ?? 0) + o.totals.total.amount);
    if (o.status === 'PAID') count.set(d, (count.get(d) ?? 0) + 1);
  }
  for (const { payment } of refundsIn(orders, p)) {
    const d = localDate(payment.createdAt);
    net.set(d, (net.get(d) ?? 0) - payment.amount.amount);
  }
  return { net, count };
}

/**
 * Sales on the hour they were paid; refunds on the hour the money went back (so the
 * rows add up to net, even when the refunded order was paid before the period).
 */
export function byHour(orders: OrderRecord[], p: Period) {
  const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, net: 0, orders: 0 }));
  for (const o of salesIn(orders, p)) {
    const r = rows[new Date(o.paidAt!).getHours()]!;
    r.net += o.totals.total.amount;
    if (o.status === 'PAID') r.orders += 1;
  }
  for (const { payment } of refundsIn(orders, p))
    rows[new Date(payment.createdAt).getHours()]!.net -= payment.amount.amount;
  return rows;
}

export function byPayment(orders: OrderRecord[], p: Period) {
  const rows = new Map<PaymentMethod, { sales: number; refunds: number; count: number }>();
  const row = (m: PaymentMethod) => {
    const r = rows.get(m) ?? { sales: 0, refunds: 0, count: 0 };
    rows.set(m, r);
    return r;
  };
  for (const o of salesIn(orders, p)) {
    for (const pay of o.payments.filter((x) => x.kind === 'SALE')) {
      const r = row(pay.method);
      r.sales += pay.amount.amount;
      r.count += 1;
    }
  }
  for (const { payment } of refundsIn(orders, p))
    row(payment.method).refunds += payment.amount.amount;
  return rows;
}

/** Refunds count against the refunded order's type, in the period the refund was made. */
export function byType(orders: OrderRecord[], p: Period) {
  const rows = new Map<OrderType, { net: number; orders: number }>();
  const row = (t: OrderType) => {
    const r = rows.get(t) ?? { net: 0, orders: 0 };
    rows.set(t, r);
    return r;
  };
  for (const o of salesIn(orders, p)) {
    const r = row(o.type);
    r.net += o.totals.total.amount;
    if (o.status === 'PAID') r.orders += 1;
  }
  for (const { order, payment } of refundsIn(orders, p))
    row(order.type).net -= payment.amount.amount;
  return rows;
}

/** Sales by the order's cashier; refunds by whoever gave the money back, when they did. */
export function byCashier(orders: OrderRecord[], p: Period) {
  const rows = new Map<string, { net: number; orders: number; discounts: number }>();
  const row = (name: string) => {
    const r = rows.get(name) ?? { net: 0, orders: 0, discounts: 0 };
    rows.set(name, r);
    return r;
  };
  for (const o of salesIn(orders, p)) {
    const r = row(o.createdBy);
    r.net += o.totals.total.amount;
    if (o.status === 'PAID') {
      r.orders += 1;
      r.discounts += o.totals.discountTotal.amount;
    }
  }
  for (const { payment } of refundsIn(orders, p))
    row(payment.createdBy).net -= payment.amount.amount;
  return rows;
}

/** Wholesale invoices and staff meals in the period (channels, not POS sales). */
export function channels(ctx: MockContext, locationIds: string[], p: Period) {
  const state = db.get();
  const invoices = state.wholesaleInvoices.filter(
    (i) =>
      i.tenantId === ctx.me.tenant.id && locationIds.includes(i.locationId) && inPeriod(i.at, p),
  );
  const returns = state.wholesaleReturns.filter(
    (r) =>
      r.tenantId === ctx.me.tenant.id && locationIds.includes(r.locationId) && inPeriod(r.at, p),
  );
  const meals = state.staffMeals.filter(
    (m) =>
      m.tenantId === ctx.me.tenant.id && locationIds.includes(m.locationId) && inPeriod(m.at, p),
  );
  return {
    invoices,
    wholesale: {
      invoices: invoices.length,
      total: money(
        ctx,
        invoices.reduce((s, i) => s + i.total.amount, 0),
      ),
      credit: money(
        ctx,
        invoices.reduce((s, i) => s + i.credit.amount, 0),
      ),
      returns: money(
        ctx,
        returns.reduce((s, r) => s + r.credit.amount, 0),
      ),
    },
    staffMeals: {
      meals: meals.length,
      value: money(
        ctx,
        meals.reduce((s, m) => s + m.value.amount, 0),
      ),
    },
  };
}

/** REP-002 per product: sold on paid (not voided) orders; refunds on the refund day. */
export function productRows(ctx: MockContext, orders: OrderRecord[], p: Period): ProductSalesRow[] {
  const state = db.get();
  const rows = new Map<
    string,
    Omit<ProductSalesRow, 'shareBps' | 'net' | 'gross' | 'discount' | 'refunded'> & {
      gross: number;
      discount: number;
      net: number;
      refunded: number;
    }
  >();
  const row = (productId: string, name: string, code: string) => {
    let r = rows.get(productId);
    if (!r) {
      const product = state.products.find((x) => x.id === productId);
      const category = state.categories.find((c) => c.id === product?.categoryId);
      r = {
        productId,
        code,
        name,
        categoryId: product?.categoryId ?? '',
        categoryName: category?.name ?? '—',
        sold: 0,
        returned: 0,
        netQuantity: 0,
        gross: 0,
        discount: 0,
        net: 0,
        refunded: 0,
      };
      rows.set(productId, r);
    }
    return r;
  };
  for (const o of salesIn(orders, p).filter((x) => x.status === 'PAID')) {
    o.lines.forEach((l, i) => {
      if (l.quantity <= 0) return;
      const t = o.totals.lines[i];
      const r = row(l.productId, l.name, l.code);
      r.sold += l.quantity;
      r.gross += t?.gross.amount ?? l.unitPrice.amount * l.quantity;
      r.discount += t?.discount.amount ?? 0;
      r.net += t?.net.amount ?? l.unitPrice.amount * l.quantity;
    });
  }
  for (const o of orders) {
    for (const ret of o.returns.filter((x) => inPeriod(x.createdAt, p))) {
      for (const l of ret.lines) {
        const line = o.lines.find((x) => x.id === l.lineId);
        const r = row(l.productId, l.name, line?.code ?? '');
        r.returned += l.quantity;
        r.refunded += l.amount.amount;
      }
    }
  }
  const all = [...rows.values()].map((r) => ({
    ...r,
    net: r.net - r.refunded,
    netQuantity: r.sold - r.returned,
  }));
  const total = all.reduce((s, r) => s + Math.max(0, r.net), 0);
  return all
    .map((r) => ({
      ...r,
      gross: money(ctx, r.gross),
      discount: money(ctx, r.discount),
      refunded: money(ctx, r.refunded),
      net: money(ctx, r.net),
      shareBps: total ? Math.round((Math.max(0, r.net) / total) * 10_000) : 0,
    }))
    .sort((a, b) => b.net.amount - a.net.amount);
}

export function locationRow(
  ctx: MockContext,
  location: { id: string; name: string },
  orders: OrderRecord[],
  p: Period,
): Omit<LocationSalesRow, 'shareBps'> {
  const f = figures(ctx, orders, p);
  const days = netByDay(orders, p);
  return {
    locationId: location.id as LocationSalesRow['locationId'],
    name: location.name,
    channel: 'POS',
    net: f.net,
    orders: f.orders,
    averageOrder: f.averageOrder,
    discounts: f.discounts,
    refunds: f.refunds,
    byDay: p.days.map((d) => ({ date: d, net: money(ctx, days.net.get(d) ?? 0) })),
  };
}

export function wholesaleRow(
  ctx: MockContext,
  van: { id: string; name: string },
  p: Period,
): Omit<LocationSalesRow, 'shareBps'> {
  const state = db.get();
  const { invoices, wholesale } = channels(ctx, [van.id], p);
  const views = invoices.map((i) => invoiceView(state, i));
  const byDay = new Map(p.days.map((d) => [d, 0]));
  for (const i of views)
    byDay.set(localDate(i.at), (byDay.get(localDate(i.at)) ?? 0) + i.total.amount);
  const net = wholesale.total.amount - wholesale.returns.amount;
  return {
    locationId: van.id as LocationSalesRow['locationId'],
    name: van.name,
    channel: 'WHOLESALE',
    net: money(ctx, net),
    orders: invoices.length,
    averageOrder: money(ctx, invoices.length ? Math.round(net / invoices.length) : 0),
    discounts: money(ctx, 0),
    refunds: wholesale.returns,
    byDay: p.days.map((d) => ({ date: d, net: money(ctx, byDay.get(d) ?? 0) })),
  };
}

/** REP-004: the ledger per item × location, split into what moved it in the period. */
export function stockRows(
  state: MockDb,
  tenantId: string,
  locationIds: string[],
  p: Period,
): StockReportRow[] {
  const pairs = trackedPairs(state, tenantId, locationIds);
  const index = new Map<string, StockReportRow>();
  for (const { productId, locationId } of pairs) {
    const product = state.products.find((x) => x.id === productId);
    if (!product) continue;
    index.set(`${productId}:${locationId}`, {
      productId,
      code: product.code,
      name: product.name,
      unit: product.stockUnit ?? 'pcs',
      categoryId: product.categoryId,
      locationId: locationId as StockReportRow['locationId'],
      opening: 0,
      received: 0,
      produced: 0,
      returned: 0,
      sold: 0,
      transferredOut: 0,
      wasted: 0,
      staffMeals: 0,
      usedInProduction: 0,
      adjusted: 0,
      closing: 0,
      onHandNow: 0,
      minStock: minStockOf(state, productId, locationId),
      status: 'OK',
    });
  }
  for (const m of state.stockMovements) {
    if (m.tenantId !== tenantId) continue;
    const r = index.get(`${m.productId}:${m.locationId}`);
    if (!r) continue;
    r.onHandNow += m.quantity;
    if (m.at < p.start) {
      r.opening += m.quantity;
      continue;
    }
    if (m.at > p.end) continue;
    const q = m.quantity;
    switch (m.type) {
      case 'PURCHASE':
      case 'TRANSFER_IN':
        r.received += q;
        break;
      case 'PRODUCTION_OUTPUT':
        r.produced += q;
        break;
      case 'RETURN':
        r.returned += q;
        break;
      case 'SALE':
        r.sold -= q;
        break;
      case 'TRANSFER_OUT':
        r.transferredOut -= q;
        break;
      case 'WASTAGE':
        r.wasted -= q;
        break;
      case 'STAFF_MEAL':
        r.staffMeals -= q;
        break;
      case 'PRODUCTION_CONSUMPTION':
        r.usedInProduction -= q;
        break;
      default:
        // OPENING and ADJUSTMENT (either sign).
        r.adjusted += q;
    }
  }
  return [...index.values()]
    .map((r) => ({
      ...r,
      closing:
        r.opening +
        r.received +
        r.produced +
        r.returned +
        r.adjusted -
        r.sold -
        r.transferredOut -
        r.wasted -
        r.staffMeals -
        r.usedInProduction,
      status: statusOf(r.onHandNow, r.minStock),
    }))
    .sort((a, b) => a.code.localeCompare(b.code) || a.locationId.localeCompare(b.locationId));
}

/** REP-005 exceptions in the period, with who approved them and why. */
export function voidRows(
  ctx: MockContext,
  orders: OrderRecord[],
  locationIds: string[],
  p: Period,
) {
  const state = db.get();
  const discounts: VoidsReport['discounts'] = [];
  const cancelled: VoidsReport['cancelled'] = [];
  const voided: VoidsReport['voided'] = [];
  const refunds: VoidsReport['refunds'] = [];
  for (const o of orders) {
    if (o.status !== 'CANCELLED') {
      for (const a of o.adjustments) {
        if (a.status !== 'ACTIVE' || a.kind === 'CHARGE' || !inPeriod(a.createdAt, p)) continue;
        let amount: number;
        if (a.kind === 'DISCOUNT') {
          amount =
            a.scope === 'ORDER'
              ? (o.totals.billDiscounts.find((b) => b.id === a.id)?.amount.amount ?? 0)
              : o.lines.reduce(
                  (s, l, i) =>
                    s +
                    (l.productId === a.productId ? (o.totals.lines[i]?.discount.amount ?? 0) : 0),
                  0,
                );
        } else {
          const line = o.lines.find((l) => l.productId === a.productId);
          amount = Math.max(0, ((a.previousValue ?? a.value) - a.value) * (line?.quantity ?? 1));
        }
        discounts.push({
          id: a.id,
          orderId: o.id,
          orderNumber: o.number,
          locationId: o.locationId,
          at: a.createdAt,
          kind: a.kind,
          label: a.label,
          amount: money(ctx, amount),
          approvedBy: a.approvedBy?.fullName ?? '—',
          reason: a.reason?.label ?? '—',
          cashier: a.createdBy,
        });
      }
    }
    if (o.cancellation && inPeriod(o.cancellation.at, p)) {
      const row = {
        orderId: o.id,
        orderNumber: o.number,
        locationId: o.locationId,
        at: o.cancellation.at,
        amount: o.totals.total,
        approvedBy: o.cancellation.approvedBy.fullName,
        reason: o.cancellation.reason.label,
        cashier: o.createdBy,
      };
      if (o.status === 'VOIDED') voided.push(row);
      else if (o.status === 'CANCELLED') cancelled.push(row);
    }
    for (const r of o.returns.filter((x) => inPeriod(x.createdAt, p))) {
      refunds.push({
        id: r.id,
        number: r.number,
        orderId: o.id,
        orderNumber: o.number,
        locationId: o.locationId,
        at: r.createdAt,
        items: r.lines.map((l) => `${l.name} ×${l.quantity}`).join(', '),
        amount: r.amount,
        approvedBy: r.approval.approvedBy.fullName,
        reason: r.approval.reason.label,
        cashier: r.createdBy,
      });
    }
  }
  const removedItems: VoidsReport['removedItems'] = state.auditLog
    .filter(
      (e) =>
        e.tenantId === ctx.me.tenant.id &&
        (e.action === 'pos.item.remove' || e.action === 'pos.item.quantity.decrease') &&
        e.locationId !== null &&
        locationIds.includes(e.locationId) &&
        inPeriod(e.at, p),
    )
    .map((e) => ({
      id: e.id,
      orderId: e.entityId,
      label: e.entityLabel ?? e.action,
      locationId: e.locationId,
      at: e.at,
      approvedBy: e.employee?.fullName ?? '—',
      reason: e.reason?.label ?? '—',
      cashier: e.userName,
    }));
  const byNewest = <T extends { at: string }>(xs: T[]) =>
    xs.sort((a, b) => b.at.localeCompare(a.at));
  return {
    discounts: byNewest(discounts),
    cancelled: byNewest(cancelled),
    voided: byNewest(voided),
    refunds: byNewest(refunds),
    removedItems: byNewest(removedItems),
  };
}
