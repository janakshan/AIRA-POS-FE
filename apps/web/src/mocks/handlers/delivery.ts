import type { DeliveryRider, Order } from '@rbp/types';
import { nowIso } from '@rbp/utils';
import { deliveryAssignSchema, deliveryStatusSchema } from '@rbp/validation';
import { http, HttpResponse } from 'msw';
import { employeePermissions, recordAudit } from '../audit';
import { type MockContext, requireFeature, resolveContext } from '../context';
import { db } from '../db';
import { DELIVERY_FLOW, isForward, withDeliveryStatus } from '../delivery';
import { API, handle, MockHttpError, parseBody } from '../http';
import {
  createKots,
  findOrder,
  locationOf,
  type OrderRecord,
  payOrder,
  publicOrder,
  save,
} from './orders';

/**
 * DEL-001…004 (FLOW-DEL-001): the counter dispatches (delivery.manage) — confirm, send to the
 * kitchen, assign a rider; riders (delivery.deliver) take their own orders out and deliver
 * them, collecting payment at the door if it wasn't paid.
 */

const conflict = (message: string, details = {}) =>
  new MockHttpError('CONFLICT', 409, message, details);

function deliveryContext(request: Request) {
  const ctx = resolveContext(request, { requireLocation: true });
  requireFeature(ctx, 'DELIVERY');
  const dispatcher = ctx.permissions.has('delivery.manage');
  const rider = ctx.permissions.has('delivery.deliver');
  if (!dispatcher && !rider) {
    throw new MockHttpError('FORBIDDEN', 403, 'Missing permission delivery.manage', {
      permission: 'delivery.manage',
    });
  }
  return { ctx, dispatcher, riderId: rider ? (ctx.me.tenantUser.employeeId ?? null) : null };
}

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Employees at this location whose role lets them deliver. */
function ridersAt(ctx: MockContext) {
  const location = locationOf(ctx).id;
  return db.get().employees.filter(
    (e) =>
      e.tenantId === ctx.me.tenant.id &&
      e.isActive &&
      e.locationIds.includes(location) &&
      // Riders deliver; dispatchers (owner, manager, counter) aren't listed as riders.
      employeePermissions(ctx.me.tenant.id, e.id).has('delivery.deliver') &&
      !employeePermissions(ctx.me.tenant.id, e.id).has('delivery.manage'),
  );
}

const deliveryOrders = (ctx: MockContext) =>
  db
    .get()
    .orders.filter(
      (o) =>
        o.tenantId === ctx.me.tenant.id &&
        o.locationId === locationOf(ctx).id &&
        o.type === 'DELIVERY' &&
        o.delivery,
    );

/** A rider may only touch deliveries assigned to them. */
function requireOwn(order: OrderRecord, riderId: string | null, dispatcher: boolean) {
  if (dispatcher) return;
  if (!riderId || order.delivery?.riderId !== riderId) {
    throw new MockHttpError('FORBIDDEN', 403, 'Not your delivery', { reason: 'NOT_ASSIGNED' });
  }
}

export const deliveryHandlers = [
  /** DEL-001: a day's deliveries at the location; riders see their own. */
  http.get(
    `${API}/deliveries`,
    handle(({ request }) => {
      const { ctx, dispatcher, riderId } = deliveryContext(request);
      const url = new URL(request.url);
      const date = url.searchParams.get('date') ?? localDate(nowIso());
      const status = url.searchParams.get('status');
      const rider = url.searchParams.get('riderId');
      const active = (o: OrderRecord) =>
        o.delivery!.status !== 'DELIVERED' && o.delivery!.status !== 'CANCELLED';
      const items: Order[] = deliveryOrders(ctx)
        // Open deliveries always show, whatever day they were taken.
        .filter((o) => localDate(o.createdAt) === date || active(o))
        .filter((o) => dispatcher || o.delivery!.riderId === riderId)
        .filter((o) => !status || o.delivery!.status === status)
        .filter((o) => !rider || o.delivery!.riderId === rider)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(publicOrder);
      return HttpResponse.json(items);
    }),
  ),

  /** DEL-002 one delivery (a rider only their own). */
  http.get(
    `${API}/deliveries/:id`,
    handle(({ request, params }) => {
      const { ctx, dispatcher, riderId } = deliveryContext(request);
      const order = findOrder(ctx, String(params.id));
      if (!order.delivery) throw new MockHttpError('NOT_FOUND', 404, 'Not a delivery order');
      requireOwn(order, riderId, dispatcher);
      return HttpResponse.json(publicOrder(order));
    }),
  ),

  /** DEL-003 riders at this location and what they're carrying. */
  http.get(
    `${API}/delivery-riders`,
    handle(({ request }) => {
      const { ctx } = deliveryContext(request);
      const orders = deliveryOrders(ctx);
      const riders: DeliveryRider[] = ridersAt(ctx).map((e) => {
        const mine = orders.filter((o) => o.delivery!.riderId === e.id);
        return {
          id: e.id,
          code: e.code,
          fullName: e.fullName,
          phone: e.phone ?? null,
          active: mine.filter((o) =>
            ['CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'NEW'].includes(
              o.delivery!.status,
            ),
          ).length,
          outNow: mine.filter((o) => o.delivery!.status === 'OUT_FOR_DELIVERY').length,
        };
      });
      return HttpResponse.json(riders);
    }),
  ),

  /** DEL-003 assign or reassign a rider (until it leaves the shop). */
  http.post(
    `${API}/orders/:id/delivery-assign`,
    handle(async ({ request, params }) => {
      const { ctx, dispatcher } = deliveryContext(request);
      if (!dispatcher) {
        throw new MockHttpError('FORBIDDEN', 403, 'Missing permission delivery.manage', {
          permission: 'delivery.manage',
        });
      }
      const order = findOrder(ctx, String(params.id));
      if (!order.delivery) throw conflict('Not a delivery order', { type: order.type });
      if (!isForward(order.delivery.status, 'OUT_FOR_DELIVERY')) {
        throw conflict(`Delivery is ${order.delivery.status}`, { status: order.delivery.status });
      }
      const { riderId } = await parseBody(request, deliveryAssignSchema);
      const rider = ridersAt(ctx).find((e) => e.id === riderId);
      if (!rider) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Not a rider here', {
          fieldErrors: { riderId: 'validation.riderRequired' },
        });
      }
      const before = order.delivery.riderName ?? null;
      const updated: OrderRecord = {
        ...order,
        delivery: {
          ...order.delivery,
          riderId: rider.id,
          riderName: rider.fullName,
          assignedAt: nowIso(),
        },
      };
      save(updated);
      recordAudit(ctx, {
        action: 'delivery.assign',
        entity: 'order',
        entityId: order.id,
        entityLabel: `${order.number} → ${rider.fullName}${before ? ` (was ${before})` : ''}`,
        before: { rider: before },
        after: { rider: rider.fullName },
      });
      return HttpResponse.json(publicOrder(updated));
    }),
  ),

  /**
   * DEL-004 status (forward only; cancelling goes through order cancel). Preparing sends
   * anything not yet sent to the kitchen; Out for delivery needs a rider; Delivered needs the
   * order paid — or payment collected now.
   */
  http.post(
    `${API}/orders/:id/delivery-status`,
    handle(async ({ request, params }) => {
      const { ctx, dispatcher, riderId } = deliveryContext(request);
      const order = findOrder(ctx, String(params.id));
      if (!order.delivery) throw conflict('Not a delivery order', { type: order.type });
      const input = await parseBody(request, deliveryStatusSchema);
      const { status } = input;
      const from = order.delivery.status;
      if (status === 'CANCELLED' || !isForward(from, status)) {
        throw conflict(`Can't move from ${from} to ${status}`, { from, to: status });
      }
      // Riders only take their own orders out and deliver them.
      if (!dispatcher && !['OUT_FOR_DELIVERY', 'DELIVERED'].includes(status)) {
        throw new MockHttpError('FORBIDDEN', 403, 'Missing permission delivery.manage', {
          permission: 'delivery.manage',
        });
      }
      requireOwn(order, riderId, dispatcher);
      if (
        DELIVERY_FLOW.indexOf(status) >= DELIVERY_FLOW.indexOf('OUT_FOR_DELIVERY') &&
        !order.delivery.riderId
      ) {
        throw conflict('Assign a rider first', { reason: 'RIDER_REQUIRED' });
      }
      if (order.status === 'CANCELLED' || order.status === 'VOIDED') {
        throw conflict(`Order is ${order.status}`, { status: order.status });
      }
      let current = order;
      if (status === 'DELIVERED' && order.status !== 'PAID') {
        if (!input.payment) {
          throw conflict('Collect payment first', { reason: 'PAYMENT_REQUIRED' });
        }
        current = payOrder(ctx, current, {
          method: input.payment.method,
          ...(input.payment.tendered ? { tendered: input.payment.tendered } : {}),
        });
      }
      // Preparing: the kitchen gets anything not yet sent.
      if (
        DELIVERY_FLOW.indexOf(status) >= DELIVERY_FLOW.indexOf('PREPARING') &&
        ctx.features.has('KOT')
      ) {
        const unsent = current.lines
          .filter((l) => l.quantity > l.sentQuantity)
          .map((line) => ({ line, quantity: line.quantity - line.sentQuantity }));
        if (unsent.length && (current.status === 'OPEN' || current.status === 'HELD')) {
          createKots(ctx, current, 'SEND', unsent);
          current = {
            ...current,
            lines: current.lines.map((l) => ({ ...l, sentQuantity: l.quantity })),
          };
        }
      }
      const updated = withDeliveryStatus(current, status, ctx.me.user.displayName);
      save(updated);
      // The dispatcher's word wins: once it's ready (or gone) the kitchen stops showing it as to-do.
      if (DELIVERY_FLOW.indexOf(status) >= DELIVERY_FLOW.indexOf('READY')) {
        const to = status === 'READY' ? 'READY' : 'COMPLETED';
        const at = nowIso();
        db.update((d) => {
          for (const k of d.kots) {
            if (k.orderId !== order.id || k.kind !== 'SEND' || k.status === 'COMPLETED') continue;
            if (to === 'READY' && k.status === 'READY') continue;
            if (to === 'READY') {
              k.status = 'READY';
              k.readyAt = at;
            } else {
              k.status = 'COMPLETED';
              k.completedAt = at;
            }
          }
        });
      }
      recordAudit(ctx, {
        action: 'pos.delivery.status',
        entity: 'order',
        entityId: order.id,
        entityLabel: `${order.number} delivery ${from} → ${status}${input.payment && order.status !== 'PAID' ? ` · paid ${input.payment.method.toLowerCase()} at the door` : ''}`,
        before: { status: from },
        after: { status },
      });
      return HttpResponse.json(publicOrder(updated));
    }),
  ),
];
