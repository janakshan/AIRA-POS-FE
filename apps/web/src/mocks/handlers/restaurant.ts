import type { DeliveryStatus, Kot, RestaurantTable } from '@rbp/types';
import { formatMoney, nowIso } from '@rbp/utils';
import { transferTableSchema } from '@rbp/validation';
import { http, HttpResponse } from 'msw';
import { recordAudit, requireVerifiedAction } from '../audit';
import { type MockContext, requireFeature, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import { withDeliveryStatus } from '../delivery';
import { API, handle, MockHttpError, parseBody } from '../http';
import {
  createKots,
  findOrder,
  freeTable,
  locationOf,
  type OrderRecord,
  publicOrder,
  requireSeller,
  routedHere,
  save,
} from './orders';

/** P3 Restaurant / KOT: tables (REST-001), sending to the kitchen, KOT lifecycle (KOT-001…004). */

const conflict = (message: string, details = {}) =>
  new MockHttpError('CONFLICT', 409, message, details);

/** Waiters (table staff) or cashiers. */
function requireTableStaff(ctx: MockContext) {
  requireFeature(ctx, 'TABLE_MANAGEMENT');
  if (!ctx.permissions.has('restaurant.table.manage')) requireSeller(ctx);
}

function requireKitchenView(ctx: MockContext) {
  requireFeature(ctx, 'KOT');
  if (!ctx.permissions.has('kot.view')) requireSeller(ctx);
}

/** Automatic moves (kitchen) go forward only. */
const setDeliveryStatus = (order: OrderRecord, status: DeliveryStatus, by = 'Kitchen') =>
  withDeliveryStatus(order, status, by);

const tenantKots = (ctx: MockContext) =>
  db
    .get()
    .kots.filter((k) => k.tenantId === ctx.me.tenant.id && k.locationId === locationOf(ctx).id);

function findKot(ctx: MockContext, id: string) {
  const kot = tenantKots(ctx).find((k) => k.id === id);
  if (!kot) throw new MockHttpError('NOT_FOUND', 404, 'KOT not found');
  return kot;
}

const publicKot = ({ tenantId: _t, ...k }: Kot & { tenantId: string }): Kot => k;

function moveKot(ctx: MockContext, id: string, from: Kot['status'][], to: Kot['status']) {
  requireFeature(ctx, 'KOT');
  requirePermission(ctx, 'kot.manage');
  const kot = findKot(ctx, id);
  if (!from.includes(kot.status)) throw conflict(`KOT is ${kot.status}`, { status: kot.status });
  const at = nowIso();
  const updated = {
    ...kot,
    status: to,
    ...(to === 'PREPARING' ? { startedAt: at } : {}),
    ...(to === 'READY' ? { readyAt: at } : {}),
    ...(to === 'COMPLETED' ? { completedAt: at } : {}),
  };
  db.update((d) => {
    d.kots = d.kots.map((k) => (k.id === kot.id ? updated : k));
  });
  // A delivery is ready once every kitchen ticket for it is ready.
  const order = db.get().orders.find((o) => o.id === kot.orderId);
  if (order?.type === 'DELIVERY' && (to === 'READY' || to === 'COMPLETED')) {
    const tickets = db.get().kots.filter((k) => k.orderId === order.id && k.kind === 'SEND');
    if (tickets.every((k) => k.status === 'READY' || k.status === 'COMPLETED')) {
      save(setDeliveryStatus(order, 'READY'));
    }
  }
  return publicKot(updated);
}

export const restaurantHandlers = [
  /** REST-001: tables with their live state, derived from open orders. */
  http.get(
    `${API}/tables`,
    handle(({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireTableStaff(ctx);
      const state = db.get();
      const open = state.orders.filter(
        (o) =>
          o.tenantId === ctx.me.tenant.id &&
          (o.status === 'OPEN' || o.status === 'HELD') &&
          o.table,
      );
      const tables: RestaurantTable[] = state.restaurantTables
        .filter((t) => t.tenantId === ctx.me.tenant.id && t.locationId === locationOf(ctx).id)
        .map((t) => {
          const order = open.find((o) => o.table?.id === t.id);
          return {
            id: t.id,
            locationId: locationOf(ctx).id,
            name: t.name,
            area: t.area,
            seats: t.seats,
            status: !order ? 'FREE' : order.billPrintedAt ? 'BILLING' : 'OCCUPIED',
            order: order
              ? {
                  id: order.id,
                  number: order.number,
                  total: order.totals.total,
                  itemCount: order.totals.itemCount,
                  openedAt: order.createdAt,
                  createdBy: order.createdBy,
                  // Only items with a kitchen station are ever sent (same rule as the POS).
                  unsent: order.lines
                    .filter((l) => routedHere(ctx, l.productId))
                    .reduce((s, l) => s + Math.max(0, l.quantity - l.sentQuantity), 0),
                }
              : null,
          };
        });
      return HttpResponse.json(tables);
    }),
  ),

  /** REST-004: move a table's order to a free table (PIN + reason, audited). */
  http.post(
    `${API}/tables/:id/transfer`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireTableStaff(ctx);
      const input = await parseBody(request, transferTableSchema);
      const order = db
        .get()
        .orders.find(
          (o) =>
            o.tenantId === ctx.me.tenant.id &&
            o.table?.id === params.id &&
            (o.status === 'OPEN' || o.status === 'HELD'),
        );
      if (!order) throw conflict('No open order on this table', { reason: 'TABLE_FREE' });
      const to = freeTable(ctx, input.toTableId);
      const verified = requireVerifiedAction(ctx, input.verification, 'restaurant.table.transfer');
      const updated: OrderRecord = { ...order, table: to };
      save(updated);
      db.update((d) => {
        for (const k of d.kots)
          if (k.orderId === order.id && k.status !== 'COMPLETED') k.table = to.name;
      });
      recordAudit(ctx, {
        action: 'restaurant.table.transfer',
        entity: 'order',
        entityId: order.id,
        entityLabel: `${order.number} · table ${order.table?.name} → ${to.name}`,
        before: { table: order.table?.name },
        after: { table: to.name },
        verified,
      });
      return HttpResponse.json(publicOrder(updated));
    }),
  ),

  /** Send everything not yet sent: one KOT per kitchen station; each round is a new KOT. */
  http.post(
    `${API}/orders/:id/send-kitchen`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      requireFeature(ctx, 'KOT');
      const order = findOrder(ctx, String(params.id));
      if (order.status !== 'OPEN' && order.status !== 'HELD') {
        throw conflict('Order is not open', { status: order.status });
      }
      const unsent = order.lines
        .filter((l) => l.quantity > l.sentQuantity)
        .map((line) => ({ line, quantity: line.quantity - line.sentQuantity }));
      if (!unsent.length) throw conflict('Nothing new to send', { reason: 'NOTHING_TO_SEND' });
      const kots = createKots(ctx, order, 'SEND', unsent);
      let updated: OrderRecord = {
        ...order,
        lines: order.lines.map((l) => ({ ...l, sentQuantity: l.quantity })),
      };
      updated = setDeliveryStatus(updated, 'PREPARING', ctx.me.user.displayName);
      save(updated);
      recordAudit(ctx, {
        action: 'pos.order.send',
        entity: 'order',
        entityId: order.id,
        entityLabel: `${order.number}${order.table ? ` · ${order.table.name}` : ''} → kitchen · ${unsent
          .map(({ line, quantity }) => `${line.name} ×${quantity}`)
          .join(', ')}`,
        before: null,
        after: { kots: kots.map((k) => `${k.number} (${k.stationName})`) },
      });
      return HttpResponse.json({ order: publicOrder(updated), kots });
    }),
  ),

  /** REST-007: print the table bill before payment (table shows "bill printed"). */
  http.post(
    `${API}/orders/:id/bill`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const order = findOrder(ctx, String(params.id));
      if (order.status !== 'OPEN') throw conflict('Order is not open', { status: order.status });
      const updated: OrderRecord = { ...order, billPrintedAt: nowIso() };
      save(updated);
      recordAudit(ctx, {
        action: 'pos.order.bill',
        entity: 'order',
        entityId: order.id,
        entityLabel: `${order.number}${order.table ? ` · ${order.table.name}` : ''} bill · ${formatMoney(order.totals.total)}`,
        before: null,
        after: { total: order.totals.total },
      });
      return HttpResponse.json(publicOrder(updated));
    }),
  ),

  /** Waiter leaves the table: the order stays open, the terminal is free for another table. */
  http.post(
    `${API}/orders/:id/release`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const order = findOrder(ctx, String(params.id));
      const updated: OrderRecord = { ...order, openedByDeviceId: null };
      save(updated);
      return HttpResponse.json(publicOrder(updated));
    }),
  ),

  /** KOT-001/003 active tickets (oldest first) for the kitchen board. */
  http.get(
    `${API}/kots`,
    handle(({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireKitchenView(ctx);
      const p = new URL(request.url).searchParams;
      const status = p.get('status');
      const stationId = p.get('stationId');
      const includeCompleted = p.get('includeCompleted') === 'true';
      return HttpResponse.json(
        tenantKots(ctx)
          .filter(
            (k) =>
              (!status || k.status === status) &&
              (!stationId || k.stationId === stationId) &&
              (includeCompleted || k.status !== 'COMPLETED'),
          )
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .map(publicKot),
      );
    }),
  ),

  http.get(
    `${API}/kots/:id`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireKitchenView(ctx);
      return HttpResponse.json(publicKot(findKot(ctx, String(params.id))));
    }),
  ),

  http.post(
    `${API}/kots/:id/start`,
    handle(({ request, params }) =>
      HttpResponse.json(
        moveKot(
          resolveContext(request, { requireLocation: true }),
          String(params.id),
          ['NEW'],
          'PREPARING',
        ),
      ),
    ),
  ),
  http.post(
    `${API}/kots/:id/ready`,
    handle(({ request, params }) =>
      HttpResponse.json(
        moveKot(
          resolveContext(request, { requireLocation: true }),
          String(params.id),
          ['NEW', 'PREPARING'],
          'READY',
        ),
      ),
    ),
  ),
  /** Served / picked up. CANCEL tickets are acknowledged straight from NEW. */
  http.post(
    `${API}/kots/:id/complete`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      const kot = findKot(ctx, String(params.id));
      return HttpResponse.json(
        moveKot(
          ctx,
          kot.id,
          kot.kind === 'CANCEL' ? ['NEW', 'PREPARING', 'READY'] : ['READY'],
          'COMPLETED',
        ),
      );
    }),
  ),
];
