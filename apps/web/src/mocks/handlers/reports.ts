import type {
  LocationSalesReport,
  Money,
  ProductSalesReport,
  Permission,
  SalesSummaryReport,
  StaffReport,
  StaffReportFigures,
  StaffReportRow,
  StockReport,
  VoidsReport,
} from '@rbp/types';
import { http, HttpResponse } from 'msw';
import { type MockContext, requireFeature, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import { API, handle } from '../http';
import { myLocationIds, requireLocationAccess } from '../location';
import {
  byCashier,
  byHour,
  byPayment,
  byType,
  channels,
  figures,
  inPeriod,
  locationRow,
  money,
  netByDay,
  ordersAt,
  type Period,
  periodOf,
  productRows,
  stockRows,
  voidRows,
  wholesaleRow,
} from '../reports';
import { attendanceRow, cashShiftView } from './staff';

/**
 * REP-001…005, REP-007 (A-287…): read-only reports over orders, the stock ledger, wholesale and staff
 * meals, for the locations the user can see (or one of them). REP-006 is `/audit-events`.
 */

function reportContext(request: Request, permission: Permission = 'report.sales.view') {
  const ctx = resolveContext(request);
  requirePermission(ctx, permission);
  const url = new URL(request.url);
  const param = url.searchParams.get('locationId');
  const locationIds = !param || param === 'all' ? myLocationIds(ctx) : [param];
  if (param && param !== 'all') requireLocationAccess(ctx, param);
  return { ctx, url, locationIds, period: periodOf(url) };
}

const locationsOf = (ctx: MockContext, ids: string[]) =>
  db.get().locations.filter((l) => l.tenantId === ctx.me.tenant.id && ids.includes(l.id));

const sumMoney = (ctx: MockContext, xs: Money[]) =>
  money(
    ctx,
    xs.reduce((s, x) => s + x.amount, 0),
  );

const categoriesOf = (ctx: MockContext, ids: Set<string>) =>
  db
    .get()
    .categories.filter((c) => c.tenantId === ctx.me.tenant.id && ids.has(c.id))
    .map((c) => ({ id: c.id as string, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

const summaryOf = (p: Period) => ({ from: p.from, to: p.to });

type StaffTally = Omit<
  StaffReportFigures,
  'net' | 'discounts' | 'refunds' | 'variance' | 'mealValue'
> & {
  net: number;
  discounts: number;
  refunds: number;
  variance: number;
  mealValue: number;
};

const emptyTally = (): StaffTally => ({
  rostered: 0,
  worked: 0,
  minutes: 0,
  late: 0,
  lateMinutes: 0,
  absent: 0,
  unrostered: 0,
  orders: 0,
  net: 0,
  discounts: 0,
  refunds: 0,
  shiftsClosed: 0,
  variance: 0,
  shortShifts: 0,
  meals: 0,
  mealValue: 0,
});

const hasActivity = (t: StaffTally) =>
  t.rostered + t.worked + t.orders + t.shiftsClosed + t.meals > 0 || t.net !== 0 || t.refunds !== 0;

const staffFigures = (ctx: MockContext, t: StaffTally): StaffReportFigures => ({
  ...t,
  net: money(ctx, t.net),
  discounts: money(ctx, t.discounts),
  refunds: money(ctx, t.refunds),
  variance: money(ctx, t.variance),
  mealValue: money(ctx, t.mealValue),
});

/**
 * REP-007 (A-294) per employee: attendance against the roster (A-282), sales as REP-001
 * "by cashier" (joined by name), drawer over/short on shifts they closed, and staff meals.
 */
const staffReport = http.get(
  `${API}/reports/staff`,
  handle(({ request }) => {
    const { ctx, locationIds, period } = reportContext(request, 'staff.view');
    requireFeature(ctx, 'HR');
    const state = db.get();
    const tenantId = ctx.me.tenant.id;
    const employees = state.employees.filter(
      (e) =>
        e.tenantId === tenantId && e.isActive && e.locationIds.some((l) => locationIds.includes(l)),
    );
    const tallies = new Map<string, StaffTally>(employees.map((e) => [e.id, emptyTally()]));
    const byName = new Map(employees.map((e) => [e.fullName, e.id]));

    for (const e of employees) {
      const t = tallies.get(e.id)!;
      for (const locationId of e.locationIds.filter((l) => locationIds.includes(l))) {
        for (const date of period.days) {
          const row = attendanceRow(state, e, locationId, date);
          if (row.shift && row.status !== 'UPCOMING') t.rostered += 1;
          if (row.records.length) {
            t.worked += 1;
            t.minutes += row.minutes;
          }
          if (row.status === 'LATE') {
            t.late += 1;
            t.lateMinutes += row.lateBy;
          }
          if (row.status === 'ABSENT') t.absent += 1;
          if (row.status === 'UNROSTERED') t.unrostered += 1;
        }
      }
    }

    // Sales by name; anyone not on the employee list keeps their own row so totals match REP-001.
    const others = new Map<string, StaffTally>();
    for (const [name, r] of byCashier(ordersAt(ctx, locationIds), period)) {
      const id = byName.get(name);
      const t = id ? tallies.get(id)! : (others.get(name) ?? emptyTally());
      if (!id) others.set(name, t);
      t.orders += r.orders;
      t.net += r.net;
      t.discounts += r.discounts;
      t.refunds += r.refunds;
    }

    for (const s of state.cashShifts) {
      if (s.tenantId !== tenantId || !locationIds.includes(s.locationId) || !s.closedBy) continue;
      if (!inPeriod(s.closedAt, period)) continue;
      const t = tallies.get(s.closedBy.employeeId);
      if (!t) continue;
      const variance = cashShiftView(state, s).variance?.amount ?? 0;
      t.shiftsClosed += 1;
      t.variance += variance;
      if (variance < 0) t.shortShifts += 1;
    }

    for (const m of state.staffMeals) {
      if (m.tenantId !== tenantId || !locationIds.includes(m.locationId)) continue;
      if (!inPeriod(m.at, period) || m.status === 'VOIDED') continue;
      const t = tallies.get(m.employeeId);
      if (!t) continue;
      t.meals += 1;
      t.mealValue += m.value.amount;
    }

    const rows: StaffReportRow[] = [
      ...employees.map((e) => ({
        employeeId: e.id as string | null,
        name: e.fullName,
        jobTitle: e.jobTitle,
        t: tallies.get(e.id)!,
      })),
      ...[...others].map(([name, t]) => ({ employeeId: null, name, jobTitle: '', t })),
    ]
      .filter((r) => hasActivity(r.t))
      .map(({ t, ...r }) => ({ ...r, ...staffFigures(ctx, t) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const total = emptyTally();
    for (const r of rows) {
      for (const k of Object.keys(total) as (keyof StaffTally)[]) {
        const v = r[k];
        total[k] += typeof v === 'number' ? v : v.amount;
      }
    }
    const body: StaffReport = {
      ...summaryOf(period),
      locationIds: locationIds as StaffReport['locationIds'],
      rows,
      totals: staffFigures(ctx, total),
    };
    return HttpResponse.json(body);
  }),
);

export const reportHandlers = [
  /** REP-001 */
  http.get(
    `${API}/reports/sales`,
    handle(({ request }) => {
      const { ctx, locationIds, period } = reportContext(request);
      const orders = ordersAt(ctx, locationIds);
      const days = netByDay(orders, period);
      const other = channels(ctx, locationIds, period);
      const body: SalesSummaryReport = {
        ...summaryOf(period),
        locationIds: locationIds as SalesSummaryReport['locationIds'],
        totals: figures(ctx, orders, period),
        byDay: period.days.map((d) => ({
          date: d,
          net: money(ctx, days.net.get(d) ?? 0),
          orders: days.count.get(d) ?? 0,
        })),
        byHour: byHour(orders, period)
          .filter((h) => h.orders > 0 || h.net !== 0)
          .map((h) => ({ hour: h.hour, net: money(ctx, h.net), orders: h.orders })),
        byPayment: [...byPayment(orders, period).entries()]
          .map(([method, r]) => ({
            method,
            sales: money(ctx, r.sales),
            refunds: money(ctx, r.refunds),
            net: money(ctx, r.sales - r.refunds),
            count: r.count,
          }))
          .sort((a, b) => b.net.amount - a.net.amount),
        byType: [...byType(orders, period).entries()]
          .map(([type, r]) => ({ type, net: money(ctx, r.net), orders: r.orders }))
          .sort((a, b) => b.net.amount - a.net.amount),
        byCashier: [...byCashier(orders, period).entries()]
          .map(([name, r]) => ({
            name,
            net: money(ctx, r.net),
            orders: r.orders,
            discounts: money(ctx, r.discounts),
          }))
          .sort((a, b) => b.net.amount - a.net.amount),
        channels: { wholesale: other.wholesale, staffMeals: other.staffMeals },
      };
      return HttpResponse.json(body);
    }),
  ),

  /** REP-002 */
  http.get(
    `${API}/reports/products`,
    handle(({ request }) => {
      const { ctx, url, locationIds, period } = reportContext(request);
      const categoryId = url.searchParams.get('categoryId');
      const all = productRows(ctx, ordersAt(ctx, locationIds), period);
      const rows = all.filter((r) => !categoryId || r.categoryId === categoryId);
      const body: ProductSalesReport = {
        ...summaryOf(period),
        rows,
        totals: {
          sold: rows.reduce((s, r) => s + r.sold, 0),
          returned: rows.reduce((s, r) => s + r.returned, 0),
          gross: sumMoney(
            ctx,
            rows.map((r) => r.gross),
          ),
          discount: sumMoney(
            ctx,
            rows.map((r) => r.discount),
          ),
          net: sumMoney(
            ctx,
            rows.map((r) => r.net),
          ),
        },
        categories: categoriesOf(ctx, new Set(all.map((r) => r.categoryId))),
      };
      return HttpResponse.json(body);
    }),
  ),

  /** REP-003 each location's POS sales, plus vans (wholesale) as their own channel. */
  http.get(
    `${API}/reports/locations`,
    handle(({ request }) => {
      const { ctx, locationIds, period } = reportContext(request);
      const locations = locationsOf(ctx, locationIds);
      const pos = locations
        .filter((l) => l.type !== 'VAN' && l.type !== 'WAREHOUSE')
        .map((l) => locationRow(ctx, l, ordersAt(ctx, [l.id]), period));
      const vans = ctx.features.has('WHOLESALE')
        ? locations.filter((l) => l.type === 'VAN').map((l) => wholesaleRow(ctx, l, period))
        : [];
      const total = pos.reduce((s, r) => s + Math.max(0, r.net.amount), 0);
      const body: LocationSalesReport = {
        ...summaryOf(period),
        rows: [...pos, ...vans]
          .map((r) => ({
            ...r,
            shareBps:
              r.channel === 'POS' && total
                ? Math.round((Math.max(0, r.net.amount) / total) * 10_000)
                : 0,
          }))
          .sort((a, b) =>
            a.channel === b.channel ? b.net.amount - a.net.amount : a.channel === 'POS' ? -1 : 1,
          ),
        totals: {
          net: money(
            ctx,
            pos.reduce((s, r) => s + r.net.amount, 0),
          ),
          orders: pos.reduce((s, r) => s + r.orders, 0),
        },
      };
      return HttpResponse.json(body);
    }),
  ),

  /** REP-004 stock over the period from the ledger. */
  http.get(
    `${API}/reports/stock`,
    handle(({ request }) => {
      const { ctx, url, locationIds, period } = reportContext(request);
      requireFeature(ctx, 'INVENTORY');
      const categoryId = url.searchParams.get('categoryId');
      const status = url.searchParams.get('status');
      const all = stockRows(db.get(), ctx.me.tenant.id, locationIds, period);
      const rows = all.filter(
        (r) => (!categoryId || r.categoryId === categoryId) && (!status || r.status === status),
      );
      const body: StockReport = {
        ...summaryOf(period),
        rows,
        totals: {
          wasted: rows.reduce((s, r) => s + r.wasted, 0),
          staffMeals: rows.reduce((s, r) => s + r.staffMeals, 0),
          received: rows.reduce((s, r) => s + r.received, 0),
          sold: rows.reduce((s, r) => s + r.sold, 0),
        },
        categories: categoriesOf(ctx, new Set(all.map((r) => r.categoryId))),
      };
      return HttpResponse.json(body);
    }),
  ),

  /** REP-005 discounts, price changes, removed items, cancellations, voids and refunds. */
  http.get(
    `${API}/reports/voids`,
    handle(({ request }) => {
      const { ctx, locationIds, period } = reportContext(request);
      const rows = voidRows(ctx, ordersAt(ctx, locationIds), locationIds, period);
      const tally = new Map<string, { count: number; amount: number }>();
      const approvers = new Map<string, { count: number; amount: number }>();
      const add = (
        m: Map<string, { count: number; amount: number }>,
        key: string,
        amount: number,
      ) => {
        const r = m.get(key) ?? { count: 0, amount: 0 };
        r.count += 1;
        r.amount += amount;
        m.set(key, r);
      };
      for (const r of [...rows.discounts, ...rows.cancelled, ...rows.voided, ...rows.refunds]) {
        add(tally, r.reason, r.amount.amount);
        add(approvers, r.approvedBy, r.amount.amount);
      }
      for (const r of rows.removedItems) {
        add(tally, r.reason, 0);
        add(approvers, r.approvedBy, 0);
      }
      const sorted = (m: Map<string, { count: number; amount: number }>) =>
        [...m.entries()]
          .map(([key, v]) => ({ key, count: v.count, amount: money(ctx, v.amount) }))
          .sort((a, b) => b.count - a.count);
      const body: VoidsReport = {
        ...summaryOf(period),
        ...rows,
        byReason: sorted(tally).map(({ key, ...r }) => ({ reason: key, ...r })),
        byApprover: sorted(approvers).map(({ key, ...r }) => ({ name: key, ...r })),
        totals: {
          discounts: sumMoney(
            ctx,
            rows.discounts.map((r) => r.amount),
          ),
          cancelled: sumMoney(
            ctx,
            rows.cancelled.map((r) => r.amount),
          ),
          voided: sumMoney(
            ctx,
            rows.voided.map((r) => r.amount),
          ),
          refunds: sumMoney(
            ctx,
            rows.refunds.map((r) => r.amount),
          ),
          removedItems: rows.removedItems.length,
        },
      };
      return HttpResponse.json(body);
    }),
  ),

  /** REP-007 */
  staffReport,
];
