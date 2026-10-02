import type {
  Kot,
  Money,
  Order,
  OrderLine,
  OrderReturn,
  Payment,
  PaymentMethod,
  PreparedDisposition,
  Receipt,
  SaleAdjustment,
} from '@rbp/types';
import { allocate, computeTotals, formatMoney, newId, nowIso } from '@rbp/utils';
import {
  cancelItemSchema,
  createOrderSchema,
  createReturnSchema,
  cancelOrderSchema,
  orderApprovalSchema,
  payOrderSchema,
  updateOrderLinesSchema,
} from '@rbp/validation';
import { http, HttpResponse } from 'msw';
import type { z } from 'zod';
import { recordAudit, requireVerifiedAction, type VerifiedAction } from '../audit';
import { type MockContext, requireFeature, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import { paymentMethodOn } from '../payments';
import { withDeliveryStatus } from '../delivery';
import { activeRecipe, postMovement } from '../inventory';
import {
  assertCanSell,
  postPreparedDisposition,
  postSaleStock,
  reverseRecipeConsumption,
} from '../recipes';
import { API, handle, MockHttpError, paginate, parseBody } from '../http';

/**
 * POS-008…012: saved sales. A draft becomes an order at Hold or Pay; from then on every change
 * is server-side, totals come from the shared `computeTotals`, and cancellations, voids and
 * returns are audited records — nothing is deleted.
 */

export type OrderRecord = Order & { tenantId: string; receiptPrints?: number };

const fieldError = (field: string, key: string, message: string, details = {}) =>
  new MockHttpError('VALIDATION_FAILED', 400, message, {
    fieldErrors: { [field]: key },
    ...details,
  });
const conflict = (message: string, details = {}) =>
  new MockHttpError('CONFLICT', 409, message, details);

export function requireSeller(ctx: MockContext) {
  if (!ctx.permissions.has('catalog.view')) requirePermission(ctx, 'pos.sale.create');
}

export const locationOf = (ctx: MockContext) => ctx.me.currentLocation!;

function settingsFor(locationId: string) {
  const s = db.get().posSettings.find((p) => p.locationId === locationId);
  return {
    serviceChargeBps: s?.serviceChargeBps ?? 0,
    taxRateBps: s?.taxRateBps ?? 0,
    taxLabel: s?.taxLabel ?? 'Tax',
    returnWindowDays: s?.returnWindowDays ?? 30,
    receiptFooter: s?.receiptFooter ?? 'Thank you!',
    receiptPrinter: s?.receiptPrinter ?? 'Receipt Printer',
  };
}

export function findOrder(ctx: MockContext, id: string): OrderRecord {
  const order = db
    .get()
    .orders.find(
      (o) => o.id === id && o.tenantId === ctx.me.tenant.id && o.locationId === locationOf(ctx).id,
    );
  if (!order) throw new MockHttpError('NOT_FOUND', 404, 'Order not found');
  return order;
}

export const publicOrder = ({ tenantId: _t, receiptPrints: _r, ...order }: OrderRecord): Order =>
  order;

export function save(order: OrderRecord) {
  db.update((d) => {
    const i = d.orders.findIndex((o) => o.id === order.id);
    const before = i >= 0 ? d.orders[i] : undefined;
    // REST-007: a printed bill is stale once the total changes — the table goes back to occupied.
    if (order.billPrintedAt && before && order.totals.total.amount !== before.totals.total.amount) {
      const { billPrintedAt: _stale, ...rest } = order;
      order = rest;
    }
    if (i >= 0) d.orders[i] = order;
    else d.orders.push(order);
  });
}

/** MAIN-000001, RTN-MAIN-000001 … per location. */
export function nextNumber(ctx: MockContext, prefix = ''): string {
  const location = locationOf(ctx);
  const key = `${location.id}:${prefix}`;
  let n = 0;
  db.update((d) => {
    n = (d.orderSequences[key] ?? 0) + 1;
    d.orderSequences[key] = n;
  });
  return `${prefix}${location.code}-${String(n).padStart(6, '0')}`;
}

/** Live location price + availability for each requested product. */
function resolveLines(
  ctx: MockContext,
  input: { productId: string; quantity: number; note?: string | undefined }[],
) {
  const state = db.get();
  const location = locationOf(ctx);
  const unsellable: string[] = [];
  const lines = input.map(({ productId, quantity, note }): OrderLine => {
    const product = state.products.find(
      (p) => p.id === productId && p.tenantId === ctx.me.tenant.id,
    );
    const row = state.locationProducts.find(
      (r) =>
        r.locationId === location.id &&
        r.productId === productId &&
        r.tenantId === ctx.me.tenant.id,
    );
    if (!product || !product.isActive || !row?.enabled || !row.isAvailable)
      unsellable.push(productId);
    return {
      id: newId('oln'),
      productId,
      code: product?.code ?? '',
      name: product?.name ?? productId,
      nameTranslations: product?.nameTranslations ?? {},
      quantity,
      cancelledQuantity: 0,
      returnedQuantity: 0,
      sentQuantity: 0,
      ...(note ? { note } : {}),
      unitPrice: row?.priceOverride ??
        product?.basePrice ?? { amount: 0, currency: ctx.me.tenant.currency },
      taxMode: product?.taxMode ?? 'INCLUSIVE',
      serviceCharge: row?.serviceCharge ?? false,
    };
  });
  if (unsellable.length) {
    throw conflict('Some items are not sold here right now', {
      productIds: unsellable,
      reason: 'UNSELLABLE',
    });
  }
  return lines;
}

/** Attach approved adjustments to this order (each can belong to one order only). */
function attachAdjustments(ctx: MockContext, orderId: string, ids: string[]): SaleAdjustment[] {
  const location = locationOf(ctx);
  const state = db.get();
  for (const id of ids) {
    const a = state.adjustments.find((x) => x.id === id && x.tenantId === ctx.me.tenant.id);
    if (
      !a ||
      a.status !== 'ACTIVE' ||
      a.locationId !== location.id ||
      (a.orderId && a.orderId !== orderId)
    ) {
      throw conflict('Discount or charge is no longer valid', {
        adjustmentId: id,
        reason: 'ADJUSTMENT',
      });
    }
  }
  db.update((d) => {
    for (const a of d.adjustments) if (ids.includes(a.id)) a.orderId = orderId;
  });
  return attachedAdjustments(ctx, orderId);
}

function attachedAdjustments(ctx: MockContext, orderId: string): SaleAdjustment[] {
  return db
    .get()
    .adjustments.filter(
      (a) => a.orderId === orderId && a.tenantId === ctx.me.tenant.id && a.status === 'ACTIVE',
    )
    .map(({ tenantId: _t, orderId: _o, ...a }) => a);
}

/** Server-side totals with the same function the cart uses. */
export function totalsFor(
  ctx: MockContext,
  order: Pick<Order, 'lines' | 'adjustments' | 'locationId'>,
) {
  return computeTotals(
    order.lines
      .filter((l) => l.quantity > 0)
      .map((l) => ({
        productId: l.productId,
        unitPrice: l.unitPrice,
        quantity: l.quantity,
        taxMode: l.taxMode,
        serviceCharge: l.serviceCharge,
      })),
    settingsFor(order.locationId),
    ctx.me.tenant.currency,
    order.adjustments,
  );
}

function customerFor(ctx: MockContext, id: string | null | undefined): Order['customer'] {
  if (!id) return null;
  const c = db.get().customers.find((x) => x.id === id && x.tenantId === ctx.me.tenant.id);
  if (!c) throw fieldError('customerId', 'validation.required', 'Unknown customer');
  return { id: c.id, name: c.name, phone: c.phones.find((p) => p.primary)?.number ?? null };
}

export function voidAttached(ctx: MockContext, order: OrderRecord, why: string) {
  for (const a of order.adjustments) {
    db.update((d) => {
      const row = d.adjustments.find((x) => x.id === a.id);
      if (row) row.status = 'VOIDED';
    });
    recordAudit(ctx, {
      action: 'pos.adjustment.void',
      entity: 'sale-adjustment',
      entityId: a.id,
      entityLabel: `Removed ${a.label} · ${why} · ${order.number}`,
      before: a,
      after: { ...a, status: 'VOIDED' },
    });
  }
}

function updateCustomerBalance(ctx: MockContext, customerId: string, delta: number) {
  db.update((d) => {
    const c = d.customers.find((x) => x.id === customerId && x.tenantId === ctx.me.tenant.id);
    if (c) {
      c.outstanding = { ...c.outstanding, amount: Math.max(0, c.outstanding.amount + delta) };
      if (delta > 0) c.lastOrderAt = nowIso();
    }
  });
}

const money = (ctx: MockContext, amount: number): Money => ({
  amount,
  currency: ctx.me.tenant.currency,
});
const fmt = (m: Money) => formatMoney(m);
const approvalOf = (v: VerifiedAction) => ({
  reason: v.reason,
  approvedBy: { id: v.employee.id, fullName: v.employee.fullName },
  at: nowIso(),
});

/** Refund for returned units: their net after discounts + their share of service charge and tax. */
function refundFor(
  order: OrderRecord,
  returning: { line: OrderLine; quantity: number }[],
): { perLine: number[]; total: number } {
  const t = order.totals;
  const netOf = (productId: string) =>
    t.lines.find((l) => l.productId === productId)?.net.amount ?? 0;
  const perLine = returning.map(({ line, quantity }) => {
    const soldNet = netOf(line.productId);
    // Units still returnable share the line's net; the returned ones take their part exactly.
    const remaining = line.quantity - line.returnedQuantity;
    const [share] = allocate(Math.round((soldNet * remaining) / Math.max(line.quantity, 1)), [
      quantity,
      remaining - quantity,
    ]);
    return share ?? 0;
  });
  const serviceBase = order.lines.reduce(
    (s, l) => s + (l.serviceCharge ? netOf(l.productId) : 0),
    0,
  );
  const taxBase = order.lines.reduce(
    (s, l) => s + (l.taxMode === 'EXCLUSIVE' ? netOf(l.productId) : 0),
    0,
  );
  let total = 0;
  returning.forEach(({ line }, i) => {
    const net = perLine[i] ?? 0;
    const service =
      line.serviceCharge && serviceBase
        ? Math.round((t.serviceCharge.amount * net) / serviceBase)
        : 0;
    const tax =
      line.taxMode === 'EXCLUSIVE' && taxBase ? Math.round((t.tax.amount * net) / taxBase) : 0;
    perLine[i] = net + service + tax;
    total += perLine[i] ?? 0;
  });
  return { perLine, total };
}

/** English fallback labels; the receipt view translates from `method`. */
const methodLabel: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank transfer',
  CREDIT: 'Credit sale',
};

function buildReceipt(ctx: MockContext, order: OrderRecord, returnId?: string): Receipt {
  const settings = settingsFor(order.locationId);
  const location = locationOf(ctx);
  const device = db.get().devices.find((d) => d.id === order.deviceId);
  const common = {
    copy:
      order.status === 'OPEN' || order.status === 'HELD'
        ? ('BILL' as const)
        : (order.receiptPrints ?? 0) > 0
          ? ('REPRINT' as const)
          : ('ORIGINAL' as const),
    orderType: order.type,
    table: order.table?.name ?? null,
    business: {
      name: ctx.me.tenant.name,
      logoText: ctx.me.tenant.branding?.logoText ?? '',
      ...(ctx.me.tenant.phone ? { phone: ctx.me.tenant.phone } : {}),
      ...(ctx.me.tenant.taxRegNo ? { taxRegNo: ctx.me.tenant.taxRegNo } : {}),
    },
    location: { name: location.name, address: location.address },
    cashier: order.createdBy,
    device: device?.name ?? null,
    customer: order.customer ? { name: order.customer.name, phone: order.customer.phone } : null,
    status: order.status,
    footer: settings.receiptFooter,
  };
  if (returnId) {
    const ret = order.returns.find((r) => r.id === returnId);
    if (!ret) throw new MockHttpError('NOT_FOUND', 404, 'Return not found');
    return {
      ...common,
      kind: 'RETURN',
      number: ret.number,
      originalNumber: order.number,
      at: ret.createdAt,
      lines: ret.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unitPrice: money(ctx, Math.round(l.amount.amount / l.quantity)),
        total: l.amount,
      })),
      rows: [],
      total: ret.amount,
      payments: [
        {
          label: `Refund · ${methodLabel[ret.refundMethod]}`,
          amount: ret.amount,
          method: ret.refundMethod,
          refund: true,
        },
      ],
    };
  }
  const t = order.totals;
  const discountByProduct = new Map(t.lines.map((l) => [l.productId, l]));
  return {
    ...common,
    kind: 'SALE',
    number: order.number,
    at: order.paidAt ?? order.createdAt,
    lines: order.lines
      .filter((l) => l.quantity > 0)
      .map((l) => {
        const computed = discountByProduct.get(l.productId);
        const priceChanged = computed && computed.unitPrice.amount !== l.unitPrice.amount;
        return {
          name: l.name,
          quantity: l.quantity,
          unitPrice: computed?.unitPrice ?? l.unitPrice,
          total: computed?.gross ?? l.unitPrice,
          ...(priceChanged ? { note: `Price changed from ${fmt(l.unitPrice)}` } : {}),
        };
      }),
    rows: [
      { label: 'Subtotal', amount: t.subtotal, kind: 'default', code: 'SUBTOTAL' },
      ...(t.lineDiscounts.amount > 0
        ? [
            {
              label: 'Item discounts',
              amount: t.lineDiscounts,
              kind: 'discount' as const,
              code: 'ITEM_DISCOUNTS' as const,
            },
          ]
        : []),
      ...t.billDiscounts.map((d) => ({
        label: d.label,
        amount: d.amount,
        kind: 'discount' as const,
      })),
      ...(t.serviceCharge.amount > 0
        ? [
            {
              label: `Service charge (${t.serviceChargeBps / 100}%)`,
              amount: t.serviceCharge,
              kind: 'charge' as const,
              code: 'SERVICE' as const,
              rateBps: t.serviceChargeBps,
            },
          ]
        : []),
      ...t.charges.map((c) => ({ label: c.label, amount: c.amount, kind: 'charge' as const })),
      ...(t.tax.amount > 0
        ? [
            {
              // The business's own tax name ("VAT"); the view adds the rate.
              label: settings.taxLabel,
              amount: t.tax,
              kind: 'charge' as const,
              code: 'TAX' as const,
              rateBps: settings.taxRateBps,
            },
          ]
        : []),
    ],
    total: t.total,
    payments: order.payments
      .filter((p) => p.kind === 'SALE')
      .map((p) => ({
        label: p.method === 'CASH' && p.tendered ? 'Cash tendered' : methodLabel[p.method],
        amount: p.tendered ?? p.amount,
        method: p.method,
        ...(p.method === 'CASH' && p.tendered ? { tendered: true } : {}),
        ...(p.reference ? { reference: p.reference } : {}),
      })),
    ...(order.payments.find((p) => p.change)?.change
      ? { change: order.payments.find((p) => p.change)!.change! }
      : {}),
  };
}

function payment(
  ctx: MockContext,
  method: PaymentMethod,
  amount: Money,
  kind: Payment['kind'],
  extra: Partial<Payment> = {},
): Payment {
  return {
    id: newId('pay'),
    method,
    amount,
    status: 'CAPTURED',
    kind,
    createdAt: nowIso(),
    createdBy: ctx.me.user.displayName,
    ...extra,
  };
}

const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

/** The item has a kitchen station here, so sending it made a KOT (others never reach the kitchen). */
export function routedHere(ctx: MockContext, productId: string) {
  const location = locationOf(ctx);
  return !!db
    .get()
    .locationProducts.find(
      (r) =>
        r.locationId === location.id &&
        r.productId === productId &&
        r.tenantId === ctx.me.tenant.id,
    )?.stationId;
}

/**
 * Create KOTs for these items, one per kitchen station (items with no station need no ticket).
 * SEND = new round of items; CANCEL = stop items already sent (REQ-379…395, SCN-004).
 */
export function createKots(
  ctx: MockContext,
  order: Order,
  kind: Kot['kind'],
  items: { line: OrderLine; quantity: number; disposition?: PreparedDisposition }[],
): Kot[] {
  const state = db.get();
  const location = locationOf(ctx);
  const byStation = new Map<string, typeof items>();
  for (const item of items) {
    const row = state.locationProducts.find(
      (r) =>
        r.locationId === location.id &&
        r.productId === item.line.productId &&
        r.tenantId === ctx.me.tenant.id,
    );
    if (!row?.stationId) continue;
    byStation.set(row.stationId, [...(byStation.get(row.stationId) ?? []), item]);
  }
  const kots: (Kot & { tenantId: string })[] = [...byStation.entries()].map(
    ([stationId, group]) => ({
      id: newId('kot'),
      tenantId: ctx.me.tenant.id,
      number: nextNumber(ctx, 'KOT-'),
      kind,
      orderId: order.id,
      orderNumber: order.number,
      orderType: order.type,
      table: order.table?.name ?? null,
      locationId: location.id,
      stationId,
      stationName: state.kitchenStations.find((s) => s.id === stationId)?.name ?? stationId,
      status: 'NEW',
      items: group.map(({ line, quantity, disposition }) => ({
        lineId: line.id,
        productId: line.productId,
        name: line.name,
        quantity,
        ...(line.note ? { note: line.note } : {}),
        ...(disposition ? { disposition } : {}),
      })),
      createdBy: ctx.me.user.displayName,
      createdAt: nowIso(),
    }),
  );
  db.update((d) => {
    d.kots.push(...kots);
  });
  return kots.map(({ tenantId: _t, ...k }) => k);
}

/**
 * Order type rules (REST-002/005/006): dine-in needs a free table, delivery needs an address
 * and phone, and each type needs its module enabled for the tenant.
 */
export function resolveOrderType(
  ctx: MockContext,
  input: {
    type?: Order['type'] | undefined;
    tableId?: string | null | undefined;
    delivery?:
      { address: string; phone: string; instructions?: string | undefined } | null | undefined;
  },
): Pick<Order, 'type' | 'table' | 'delivery'> {
  const type = input.type ?? 'RETAIL';
  if (type !== 'RETAIL') requireFeature(ctx, 'POS_RESTAURANT');
  if (type === 'DINE_IN') {
    requireFeature(ctx, 'TABLE_MANAGEMENT');
    if (!input.tableId) throw fieldError('tableId', 'validation.tableRequired', 'Choose a table');
    return { type, table: freeTable(ctx, input.tableId), delivery: null };
  }
  if (type === 'DELIVERY') {
    requireFeature(ctx, 'DELIVERY');
    if (!input.delivery)
      throw fieldError('delivery', 'validation.addressRequired', 'Delivery address needed');
    const { instructions, ...rest } = input.delivery;
    return {
      type,
      table: null,
      delivery: {
        ...rest,
        ...(instructions ? { instructions } : {}),
        status: 'NEW',
        history: [{ status: 'NEW', at: nowIso(), by: ctx.me.user.displayName }],
      },
    };
  }
  return { type, table: null, delivery: null };
}

/** A table at this location with no open/held order on it. */
export function freeTable(ctx: MockContext, tableId: string): { id: string; name: string } {
  const table = db
    .get()
    .restaurantTables.find(
      (t) =>
        t.id === tableId && t.tenantId === ctx.me.tenant.id && t.locationId === locationOf(ctx).id,
    );
  if (!table) throw fieldError('tableId', 'validation.tableRequired', 'Unknown table');
  const busy = db
    .get()
    .orders.some((o) => o.table?.id === tableId && (o.status === 'OPEN' || o.status === 'HELD'));
  if (busy)
    throw conflict(`Table ${table.name} is occupied`, { tableId, reason: 'TABLE_OCCUPIED' });
  return { id: table.id, name: table.name };
}

export type PayOrderInput = z.output<typeof payOrderSchema>;

/**
 * Take payment for an open order (POS-007, DEL-004 collect on delivery): stock check,
 * payment, takeaway/delivery to the kitchen if not yet sent, stock movements, audit.
 */
export function payOrder(ctx: MockContext, order: OrderRecord, input: PayOrderInput): OrderRecord {
  if (order.status !== 'OPEN')
    throw conflict('Order is not open for payment', { status: order.status });
  // Authoritative stock check: someone else may have sold the last one since it was saved.
  assertCanSell(ctx, order.locationId, order.lines);
  const total = order.totals.total;
  if (!paymentMethodOn(ctx.me.tenant.id, input.method)) {
    throw fieldError('method', 'validation.methodOff', `${input.method} is turned off`);
  }
  let extra: Partial<Payment> = {};
  if (input.method === 'CASH') {
    if (!input.tendered || input.tendered.amount < total.amount) {
      throw fieldError('tendered', 'validation.tenderedShort', 'Not enough cash tendered');
    }
    extra = {
      tendered: input.tendered,
      change: money(ctx, input.tendered.amount - total.amount),
    };
  } else if (input.method === 'CARD') {
    // Simulated card terminal approval.
    extra = { reference: `AUTH-${String(Math.floor(Math.random() * 900000) + 100000)}` };
  } else if (input.method === 'BANK_TRANSFER') {
    if (!input.reference)
      throw fieldError('reference', 'validation.referenceRequired', 'Reference required');
    extra = { reference: input.reference };
  } else if (input.method === 'CREDIT') {
    if (!order.customer)
      throw fieldError('method', 'validation.creditNeedsCustomer', 'Credit sale needs a customer');
    updateCustomerBalance(ctx, order.customer.id, total.amount);
  }
  // Takeaway/delivery paid at the counter: anything not yet sent goes to the kitchen now,
  // so no paid food is forgotten (dine-in is sent by the waiter as the meal goes).
  const unsent = order.lines.filter((l) => l.quantity > l.sentQuantity);
  const autoSend =
    (order.type === 'TAKEAWAY' || order.type === 'DELIVERY') &&
    unsent.length > 0 &&
    ctx.features.has('KOT');
  if (autoSend) {
    createKots(
      ctx,
      order,
      'SEND',
      unsent.map((line) => ({ line, quantity: line.quantity - line.sentQuantity })),
    );
  }
  const sentOrder = autoSend
    ? withDeliveryStatus(
        { ...order, lines: order.lines.map((l) => ({ ...l, sentQuantity: l.quantity })) },
        'PREPARING',
        ctx.me.user.displayName,
      )
    : order;
  const paid: OrderRecord = {
    ...sentOrder,
    status: 'PAID',
    paidAt: nowIso(),
    openedByDeviceId: null,
    payments: [...order.payments, payment(ctx, input.method, total, 'SALE', extra)],
  };
  save(paid);
  // INV: the sale leaves stock when it's paid (REC: recipe dishes use their ingredients).
  postSaleStock(ctx, paid);
  if (order.customer) {
    const customerId = order.customer.id;
    db.update((d) => {
      const c = d.customers.find((x) => x.id === customerId);
      if (c) c.lastOrderAt = paid.paidAt ?? null;
    });
  }
  recordAudit(ctx, {
    action: 'pos.order.pay',
    entity: 'order',
    entityId: order.id,
    entityLabel: `${order.number} · ${input.method.replace('_', ' ')} · ${fmt(total)}`,
    before: { status: order.status },
    after: { status: 'PAID', method: input.method, total },
  });
  return paid;
}

export const orderHandlers = [
  http.get(
    `${API}/orders`,
    handle(({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const p = new URL(request.url).searchParams;
      const status = p.get('status');
      const from = p.get('from');
      const to = p.get('to');
      const type = p.get('type');
      const method = p.get('paymentMethod');
      const q = p.get('search')?.trim().toLowerCase();
      const digits = q?.replace(/\D/g, '');
      const items = db
        .get()
        .orders.filter(
          (o) =>
            o.tenantId === ctx.me.tenant.id &&
            o.locationId === locationOf(ctx).id &&
            (!status || o.status === status) &&
            (!from || o.createdAt >= from) &&
            (!to || o.createdAt <= to) &&
            (!type || o.type === type) &&
            (!method || o.payments.some((x) => x.kind === 'SALE' && x.method === method)) &&
            (!q ||
              o.number.toLowerCase().includes(q) ||
              o.customer?.name.toLowerCase().includes(q) ||
              (!!digits && digits.length >= 3 && !!o.customer?.phone?.includes(digits)) ||
              o.returns.some((r) => r.number.toLowerCase().includes(q))),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(publicOrder);
      return HttpResponse.json(paginate(items, new URL(request.url)));
    }),
  ),

  http.get(
    `${API}/orders/:id`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      return HttpResponse.json(publicOrder(findOrder(ctx, String(params.id))));
    }),
  ),

  /** Save a draft as an order: OPEN (about to pay) or HELD (POS-010). */
  http.post(
    `${API}/orders`,
    handle(async ({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const input = await parseBody(request, createOrderSchema);
      const id = newId('ord');
      const kind = resolveOrderType(ctx, input);
      const lines = resolveLines(ctx, input.lines);
      assertCanSell(ctx, locationOf(ctx).id, lines);
      const customer = customerFor(ctx, input.customerId);
      const adjustments = attachAdjustments(ctx, id, input.adjustmentIds);
      const now = nowIso();
      const held = input.status === 'HELD';
      const base = { lines, adjustments, locationId: locationOf(ctx).id };
      const order: OrderRecord = {
        id,
        tenantId: ctx.me.tenant.id,
        number: nextNumber(ctx),
        type: kind.type,
        table: kind.table,
        delivery: kind.delivery,
        status: input.status,
        locationId: locationOf(ctx).id,
        deviceId: ctx.me.device?.id ?? null,
        openedByDeviceId: held ? null : (ctx.me.device?.id ?? null),
        customer,
        lines,
        adjustments,
        totals: totalsFor(ctx, base),
        payments: [],
        returns: [],
        ...(held
          ? { heldAt: now, ...(input.holdLabel ? { holdLabel: input.holdLabel } : {}) }
          : {}),
        createdBy: ctx.me.user.displayName,
        createdAt: now,
      };
      save(order);
      // Remember where a customer's deliveries go, so the next order fills it in (REST-006).
      if (order.delivery && customer) {
        const address = order.delivery.address;
        db.update((d) => {
          const c = d.customers.find((x) => x.id === customer.id);
          if (c && c.deliveryAddress !== address) {
            c.deliveryAddress = address;
            c.updatedAt = now;
          }
        });
      }
      if (held) {
        recordAudit(ctx, {
          action: 'pos.order.hold',
          entity: 'order',
          entityId: order.id,
          entityLabel: `${order.number} held${order.holdLabel ? ` · ${order.holdLabel}` : ''} · ${fmt(order.totals.total)}`,
          before: null,
          after: { status: 'HELD', total: order.totals.total, items: order.totals.itemCount },
        });
      }
      return HttpResponse.json(publicOrder(order), { status: 201 });
    }),
  ),

  /** Sync a resumed order. Additions are free; reductions must be cancelled with a PIN first. */
  http.put(
    `${API}/orders/:id/lines`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const order = findOrder(ctx, String(params.id));
      if (order.status !== 'OPEN') throw conflict('Order is not open', { status: order.status });
      const input = await parseBody(request, updateOrderLinesSchema);
      const wanted = new Map(input.lines.map((l) => [l.productId, l.quantity]));
      const notes = new Map(input.lines.map((l) => [l.productId, l.note]));
      for (const line of order.lines) {
        if (line.quantity > 0 && (wanted.get(line.productId) ?? 0) < line.quantity) {
          throw new MockHttpError(
            'VERIFICATION_REQUIRED',
            428,
            `${line.name} was reduced without approval`,
            {
              productId: line.productId,
              reason: 'QUANTITY_REDUCED',
              action: 'pos.item.quantity.decrease',
            },
          );
        }
      }
      const existing = new Set(order.lines.map((l) => l.productId));
      const added = resolveLines(
        ctx,
        input.lines.filter((l) => !existing.has(l.productId)),
      );
      const lines = [
        ...order.lines.map((l) => {
          const note = notes.get(l.productId);
          return {
            ...l,
            quantity: wanted.get(l.productId) ?? l.quantity,
            ...(note !== undefined ? { note } : {}),
          };
        }),
        ...added,
      ];
      assertCanSell(ctx, order.locationId, lines);
      const adjustments = attachAdjustments(ctx, order.id, input.adjustmentIds);
      const held = input.status === 'HELD';
      const updated: OrderRecord = {
        ...order,
        lines,
        adjustments,
        customer:
          input.customerId === undefined ? order.customer : customerFor(ctx, input.customerId),
        ...(order.delivery && input.delivery
          ? { delivery: { ...order.delivery, ...input.delivery } }
          : {}),
        totals: totalsFor(ctx, { lines, adjustments, locationId: order.locationId }),
        ...(held
          ? {
              status: 'HELD',
              heldAt: nowIso(),
              openedByDeviceId: null,
              ...(input.holdLabel ? { holdLabel: input.holdLabel } : {}),
            }
          : {}),
      };
      save(updated);
      if (held) {
        recordAudit(ctx, {
          action: 'pos.order.hold',
          entity: 'order',
          entityId: order.id,
          entityLabel: `${order.number} held again · ${fmt(updated.totals.total)}`,
          before: { total: order.totals.total },
          after: { status: 'HELD', total: updated.totals.total },
        });
      }
      return HttpResponse.json(publicOrder(updated));
    }),
  ),

  /** POS-010 resume a held sale on this terminal. */
  http.post(
    `${API}/orders/:id/resume`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const order = findOrder(ctx, String(params.id));
      const device = ctx.me.device?.id ?? null;
      if (order.status === 'OPEN' && order.openedByDeviceId && order.openedByDeviceId !== device) {
        throw conflict('Open on another terminal', { openedByDeviceId: order.openedByDeviceId });
      }
      if (order.status !== 'HELD' && order.status !== 'OPEN') {
        throw conflict('Only held sales can be resumed', { status: order.status });
      }
      const updated: OrderRecord = { ...order, status: 'OPEN', openedByDeviceId: device };
      save(updated);
      recordAudit(ctx, {
        action: 'pos.order.resume',
        entity: 'order',
        entityId: order.id,
        entityLabel: `${order.number} resumed`,
        before: { status: order.status },
        after: { status: 'OPEN' },
      });
      return HttpResponse.json(publicOrder(updated));
    }),
  ),

  /** POS-008 take payment (single method; split payment is future). */
  http.post(
    `${API}/orders/:id/payments`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const order = findOrder(ctx, String(params.id));
      if (order.status !== 'OPEN')
        throw conflict('Order is not open for payment', { status: order.status });
      const input = await parseBody(request, payOrderSchema);
      return HttpResponse.json(publicOrder(payOrder(ctx, order, input)));
    }),
  ),

  /** Take items off a saved order (REQ-217…232): PIN + reason, audited, never deleted. */
  http.post(
    `${API}/orders/:id/items/:lineId/cancel`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const order = findOrder(ctx, String(params.id));
      if (order.status !== 'OPEN' && order.status !== 'HELD') {
        throw conflict('Order is not open', { status: order.status });
      }
      const input = await parseBody(request, cancelItemSchema);
      const line = order.lines.find((l) => l.id === params.lineId);
      if (!line) throw new MockHttpError('NOT_FOUND', 404, 'Line not found');
      if (input.quantity > line.quantity)
        throw fieldError('quantity', 'validation.required', 'More than on the order');
      const removing = input.quantity === line.quantity;
      const action = removing ? 'pos.item.remove' : 'pos.item.quantity.decrease';
      // Units already sent to the kitchen: say what happens to the food (SCN-004).
      const unsent = line.quantity - line.sentQuantity;
      const sentCancelled = routedHere(ctx, line.productId)
        ? Math.max(0, input.quantity - unsent)
        : 0;
      if (sentCancelled > 0 && !input.disposition) {
        throw fieldError(
          'disposition',
          'validation.dispositionRequired',
          'Say what happens to the prepared food',
        );
      }
      const verified = requireVerifiedAction(ctx, input.verification, action);
      const lines = order.lines.map((l) =>
        l.id === line.id
          ? {
              ...l,
              quantity: l.quantity - input.quantity,
              cancelledQuantity: l.cancelledQuantity + input.quantity,
              sentQuantity: l.sentQuantity - sentCancelled,
            }
          : l,
      );
      if (sentCancelled > 0) {
        createKots(ctx, order, 'CANCEL', [
          {
            line,
            quantity: sentCancelled,
            ...(input.disposition ? { disposition: input.disposition } : {}),
          },
        ]);
        // SCN-004: food that was made is wasted, eaten by staff, or queued for resale (REC-005).
        if (input.disposition) {
          postPreparedDisposition(ctx, order, line, sentCancelled, input.disposition);
        }
      }
      // An item discount / price change goes with a fully removed item.
      const dropped = removing
        ? order.adjustments.filter((a) => a.scope === 'LINE' && a.productId === line.productId)
        : [];
      if (dropped.length) voidAttached(ctx, { ...order, adjustments: dropped }, 'item removed');
      const adjustments = order.adjustments.filter((a) => !dropped.includes(a));
      const updated: OrderRecord = {
        ...order,
        lines,
        adjustments,
        totals: totalsFor(ctx, { lines, adjustments, locationId: order.locationId }),
      };
      save(updated);
      recordAudit(ctx, {
        action,
        entity: 'order',
        entityId: order.id,
        entityLabel: `${order.number} · ${line.name} ${line.quantity} → ${line.quantity - input.quantity}`,
        before: { item: line.name, quantity: line.quantity, total: order.totals.total },
        after: {
          item: line.name,
          quantity: line.quantity - input.quantity,
          total: updated.totals.total,
        },
        verified,
      });
      return HttpResponse.json(publicOrder(updated));
    }),
  ),

  /** POS-012 cancel an unpaid (open/held) order. */
  http.post(
    `${API}/orders/:id/cancel`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const order = findOrder(ctx, String(params.id));
      if (order.status !== 'OPEN' && order.status !== 'HELD') {
        throw conflict('Only unpaid orders can be cancelled', { status: order.status });
      }
      const input = await parseBody(request, cancelOrderSchema);
      // A-230 / SCN-004: food the kitchen already has needs a disposition, as for one item.
      const sent = order.lines
        .filter((l) => l.sentQuantity > 0 && routedHere(ctx, l.productId))
        .map((line) => ({ line, quantity: line.sentQuantity }));
      if (sent.length && !input.disposition) {
        throw fieldError(
          'disposition',
          'validation.dispositionRequired',
          'Say what happens to the prepared food',
        );
      }
      const verified = requireVerifiedAction(ctx, input.verification, 'pos.order.cancel');
      voidAttached(ctx, order, 'order cancelled');
      // Tell the kitchen to stop anything already sent; wastage / resale / staff meal post too.
      const { disposition } = input;
      if (sent.length && disposition) {
        createKots(
          ctx,
          order,
          'CANCEL',
          sent.map((item) => ({ ...item, disposition })),
        );
        for (const { line, quantity } of sent) {
          postPreparedDisposition(ctx, order, line, quantity, disposition);
        }
      }
      const updated: OrderRecord = {
        // DEL: a cancelled delivery order is a cancelled delivery.
        ...withDeliveryStatus(order, 'CANCELLED', ctx.me.user.displayName, true),
        status: 'CANCELLED',
        openedByDeviceId: null,
        adjustments: [],
        cancellation: approvalOf(verified),
      };
      save(updated);
      recordAudit(ctx, {
        action: 'pos.order.cancel',
        entity: 'order',
        entityId: order.id,
        entityLabel: `${order.number} cancelled · ${fmt(order.totals.total)}`,
        before: { status: order.status, total: order.totals.total },
        after: { status: 'CANCELLED', ...(sent.length ? { disposition: input.disposition } : {}) },
        verified,
      });
      return HttpResponse.json(publicOrder(updated));
    }),
  ),

  /** POS-012 void a paid invoice (same day, no returns): refunds every payment. */
  http.post(
    `${API}/orders/:id/void`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const order = findOrder(ctx, String(params.id));
      if (order.status !== 'PAID')
        throw conflict('Only paid invoices can be voided', { status: order.status });
      if (order.returns.length)
        throw conflict('Invoice has returns — use a return instead', { reason: 'HAS_RETURNS' });
      if (!order.paidAt || !sameDay(order.paidAt)) {
        throw conflict('Only today’s invoices can be voided — use a return instead', {
          reason: 'NOT_TODAY',
        });
      }
      const input = await parseBody(request, orderApprovalSchema);
      const verified = requireVerifiedAction(ctx, input.verification, 'pos.invoice.void');
      const refunds = order.payments
        .filter((p) => p.kind === 'SALE' && p.status === 'CAPTURED')
        .map((p) => {
          if (p.method === 'CREDIT' && order.customer)
            updateCustomerBalance(ctx, order.customer.id, -p.amount.amount);
          return payment(ctx, p.method, p.amount, 'REFUND');
        });
      const updated: OrderRecord = {
        ...order,
        status: 'VOIDED',
        payments: [
          ...order.payments.map((p) =>
            p.kind === 'SALE' ? { ...p, status: 'REFUNDED' as const } : p,
          ),
          ...refunds,
        ],
        cancellation: approvalOf(verified),
      };
      save(updated);
      // INV: a voided sale's goods go back into stock (REC: its ingredients).
      reverseRecipeConsumption(ctx, order);
      for (const l of order.lines.filter(
        (x) => x.quantity > 0 && !activeRecipe(db.get(), ctx.me.tenant.id, x.productId),
      )) {
        postMovement(ctx, {
          productId: l.productId,
          locationId: order.locationId,
          type: 'RETURN',
          quantity: l.quantity,
          reference: { kind: 'VOID', id: order.id, number: order.number },
          note: 'Invoice voided',
        });
      }
      recordAudit(ctx, {
        action: 'pos.invoice.void',
        entity: 'order',
        entityId: order.id,
        entityLabel: `${order.number} voided · ${fmt(order.totals.total)} refunded`,
        before: { status: 'PAID', total: order.totals.total },
        after: { status: 'VOIDED' },
        verified,
      });
      return HttpResponse.json(publicOrder(updated));
    }),
  ),

  /** POS-011 return items from a paid order and refund them (REQ-225/228, SCN-007). */
  http.post(
    `${API}/orders/:id/returns`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const order = findOrder(ctx, String(params.id));
      if (order.status !== 'PAID')
        throw conflict('Only paid sales can be returned', { status: order.status });
      const days = settingsFor(order.locationId).returnWindowDays;
      if (order.paidAt && Date.now() - new Date(order.paidAt).getTime() > days * 86_400_000) {
        throw conflict(`Returns are accepted within ${days} days`, { reason: 'WINDOW', days });
      }
      const input = await parseBody(request, createReturnSchema);
      const returning = input.lines.map(({ lineId, quantity }) => {
        const line = order.lines.find((l) => l.id === lineId);
        if (!line) throw new MockHttpError('NOT_FOUND', 404, 'Line not found');
        if (quantity > line.quantity - line.returnedQuantity) {
          throw fieldError('lines', 'validation.returnTooMany', 'More than can be returned', {
            lineId,
          });
        }
        return { line, quantity };
      });
      const verified = requireVerifiedAction(ctx, input.verification, 'pos.return');

      const lines = order.lines.map((l) => {
        const r = returning.find((x) => x.line.id === l.id);
        return r ? { ...l, returnedQuantity: l.returnedQuantity + r.quantity } : l;
      });
      const fullyReturned = lines.every((l) => l.returnedQuantity >= l.quantity);
      const { perLine, total } = refundFor(order, returning);
      const alreadyRefunded = order.returns.reduce((s, r) => s + r.amount.amount, 0);
      // The last return settles everything left (incl. delivery/packaging and rounding).
      const amount = fullyReturned ? order.totals.total.amount - alreadyRefunded : total;

      const original = order.payments.find((p) => p.kind === 'SALE');
      const method: PaymentMethod =
        input.refundMethod === 'CASH' ? 'CASH' : (original?.method ?? 'CASH');
      if (method === 'CREDIT' && order.customer)
        updateCustomerBalance(ctx, order.customer.id, -amount);

      const ret: OrderReturn = {
        id: newId('rtn'),
        number: nextNumber(ctx, 'RTN-'),
        lines: returning.map(({ line, quantity }, i) => ({
          lineId: line.id,
          productId: line.productId,
          name: line.name,
          quantity,
          amount: money(ctx, perLine[i] ?? 0),
        })),
        amount: money(ctx, amount),
        refundMethod: method,
        approval: approvalOf(verified),
        createdAt: nowIso(),
        createdBy: ctx.me.user.displayName,
      };
      const updated: OrderRecord = {
        ...order,
        lines,
        returns: [...order.returns, ret],
        payments: [...order.payments, payment(ctx, method, ret.amount, 'REFUND')],
      };
      save(updated);
      // INV: returned goods come back into stock; if they can't be resold, they're wastage.
      const retRef = { kind: 'RETURN' as const, id: ret.id, number: ret.number };
      for (const { line, quantity } of returning) {
        // REC: cooked food never goes back into ingredients.
        if (activeRecipe(db.get(), ctx.me.tenant.id, line.productId)) continue;
        postMovement(ctx, {
          productId: line.productId,
          locationId: order.locationId,
          type: 'RETURN',
          quantity,
          reference: retRef,
          note: `Returned from ${order.number}`,
        });
        if (input.restock === false) {
          postMovement(ctx, {
            productId: line.productId,
            locationId: order.locationId,
            type: 'WASTAGE',
            quantity: -quantity,
            reference: retRef,
            note: 'Returned, not resellable',
          });
        }
      }
      const label = `${ret.number} for ${order.number} · ${ret.lines.map((l) => `${l.name} ×${l.quantity}`).join(', ')}`;
      recordAudit(ctx, {
        action: 'pos.return',
        entity: 'order',
        entityId: order.id,
        entityLabel: label,
        before: null,
        after: { return: ret.number, items: ret.lines.map((l) => `${l.name} ×${l.quantity}`) },
        verified,
      });
      recordAudit(ctx, {
        action: 'pos.refund',
        entity: 'order',
        entityId: order.id,
        entityLabel: `${ret.number} · ${method.replace('_', ' ')} · ${fmt(ret.amount)}`,
        before: null,
        after: { amount: ret.amount, method },
        verified,
      });
      return HttpResponse.json(publicOrder(updated), { status: 201 });
    }),
  ),

  http.get(
    `${API}/orders/:id/receipt`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      return HttpResponse.json(buildReceipt(ctx, findOrder(ctx, String(params.id))));
    }),
  ),

  http.get(
    `${API}/orders/:id/returns/:returnId/receipt`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      return HttpResponse.json(
        buildReceipt(ctx, findOrder(ctx, String(params.id)), String(params.returnId)),
      );
    }),
  ),

  /** Simulated receipt printer (INS-421). Reprints are audited separately. */
  http.post(
    `${API}/orders/:id/receipt/print`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requireSeller(ctx);
      const order = findOrder(ctx, String(params.id));
      const body = (await request.json().catch(() => ({}))) as { returnId?: string };
      // SET-008: the location's receipt printer.
      const printer = settingsFor(order.locationId).receiptPrinter;
      // A table bill (pro-forma, audited by /bill) doesn't count as the receipt's print.
      if (order.status === 'OPEN' || order.status === 'HELD') {
        return HttpResponse.json({ printer, copy: 'BILL' });
      }
      const reprint = (order.receiptPrints ?? 0) > 0;
      save({ ...order, receiptPrints: (order.receiptPrints ?? 0) + 1 });
      const number = body.returnId
        ? (order.returns.find((r) => r.id === body.returnId)?.number ?? order.number)
        : order.number;
      recordAudit(ctx, {
        action: reprint ? 'pos.receipt.reprint' : 'pos.receipt.print',
        entity: 'order',
        entityId: order.id,
        entityLabel: `${number} receipt ${reprint ? 'reprinted' : 'printed'}`,
        before: null,
        after: { copy: reprint ? 'REPRINT' : 'ORIGINAL' },
      });
      return HttpResponse.json({
        printer,
        copy: reprint ? 'REPRINT' : 'ORIGINAL',
      });
    }),
  ),
];
