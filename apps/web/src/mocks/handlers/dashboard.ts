import type { DashboardSummary, Location, LocationDashboard } from '@rbp/types';
import { nowIso } from '@rbp/utils';
import { http, HttpResponse } from 'msw';
import { mockConfig } from '../config';
import { type MockContext, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import { levelFor, trackedPairs } from '../inventory';
import { API, handle } from '../http';

/** Small deterministic PRNG so numbers are stable for a given location/day/scenario. */
function seeded(seedText: string) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Today's figures for one location (DASH-001, and each DASH-002 row). */
function summaryFor(ctx: MockContext, location: Location): Omit<DashboardSummary, 'asOf'> {
  const { scenario } = mockConfig.getState();
  const currency = ctx.me.tenant.currency;
  const rand = seeded(`${location.id}|${new Date().toDateString()}|${scenario}`);

  // The busy-day scenario scales the (simulated) sales figures only; tables and tickets
  // below are counted from real orders.
  const busy = scenario === 'SCN-002' ? 2.2 : 1;
  // Stores and vans don't ring up counter sales, so no simulated takings for them.
  const sells = location.type !== 'WAREHOUSE' && location.type !== 'VAN';
  const currentHour = new Date().getHours();
  const hourlySales: DashboardSummary['hourlySales'] = [];
  // Trading day 07:00–22:00; outside those hours show the full day.
  const lastHour = currentHour < 7 ? 22 : Math.min(currentHour, 22);
  for (let hour = 7; hour <= lastHour; hour++) {
    const peak = hour === 12 || hour === 13 || hour === 19 || hour === 20 ? 2.4 : 1;
    // Whole rupees → minor units; integers only.
    const rupees = sells ? Math.round((1500 + rand() * 9000) * peak * busy) : 0;
    hourlySales.push({ hour, amount: rupees * 100 });
  }
  const total = hourlySales.reduce((acc, h) => acc + h.amount, 0);
  const orders = sells ? Math.max(1, Math.round(total / 100 / (1200 + rand() * 900))) : 0;
  const restaurant =
    ctx.features.has('TABLE_MANAGEMENT') &&
    (location.type === 'RESTAURANT' || location.type === 'MIXED');
  const state = db.get();
  const here = <T extends { tenantId: string; locationId: string }>(r: T) =>
    r.tenantId === ctx.me.tenant.id && r.locationId === location.id;
  // Tables with an open (or held) dine-in order, as on REST-001.
  const openTables = new Set(
    state.orders.flatMap((o) =>
      here(o) && o.type === 'DINE_IN' && (o.status === 'OPEN' || o.status === 'HELD') && o.table
        ? [o.table.id]
        : [],
    ),
  ).size;
  // Food tickets the kitchen hasn't served yet (cancellations aren't work to cook).
  const pendingKots = state.kots.filter(
    (k) => here(k) && k.kind === 'SEND' && k.status !== 'COMPLETED',
  ).length;

  return {
    salesToday: { amount: total, currency },
    ordersToday: orders,
    averageOrderValue: { amount: orders ? Math.round(total / orders) : 0, currency },
    openTables: restaurant ? openTables : 0,
    pendingKots: ctx.features.has('KOT') && restaurant ? pendingKots : 0,
    lowStockItems: ctx.features.has('INVENTORY')
      ? trackedPairs(state, ctx.me.tenant.id, [location.id]).filter(({ productId }) => {
          const level = levelFor(state, ctx.me.tenant.id, productId, location.id);
          return level && level.status !== 'OK';
        }).length
      : 0,
    hourlySales,
  };
}

export const dashboardHandlers = [
  http.get(
    `${API}/dashboard/summary`,
    handle(({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requirePermission(ctx, 'dashboard.view');
      return HttpResponse.json<DashboardSummary>({
        asOf: nowIso(),
        ...summaryFor(ctx, ctx.me.currentLocation!),
      });
    }),
  ),
  // DASH-002: every location the user can see. Cross-location takings are manager-level.
  http.get(
    `${API}/dashboard/locations`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'dashboard.view');
      requirePermission(ctx, 'report.sales.view');
      const currency = ctx.me.tenant.currency;
      const locations = ctx.me.locations
        .map((location) => ({
          location: {
            id: location.id,
            code: location.code,
            name: location.name,
            type: location.type,
          },
          ...summaryFor(ctx, location),
        }))
        .sort((a, b) => b.salesToday.amount - a.salesToday.amount);
      const sales = locations.reduce((acc, r) => acc + r.salesToday.amount, 0);
      const orders = locations.reduce((acc, r) => acc + r.ordersToday, 0);
      return HttpResponse.json<LocationDashboard>({
        asOf: nowIso(),
        totals: {
          salesToday: { amount: sales, currency },
          ordersToday: orders,
          averageOrderValue: { amount: orders ? Math.round(sales / orders) : 0, currency },
          lowStockItems: locations.reduce((acc, r) => acc + r.lowStockItems, 0),
        },
        locations,
      });
    }),
  ),
];
