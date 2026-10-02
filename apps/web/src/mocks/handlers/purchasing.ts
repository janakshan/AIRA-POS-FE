import type { GoodsReceipt, PurchaseOrder, PurchaseOrderStatus, Supplier } from '@rbp/types';
import {
  cancelPurchaseOrderSchema,
  purchaseOrderSchema,
  receiveGoodsSchema,
  supplierSchema,
} from '@rbp/validation';
import { newId, normalizePhone, nowIso } from '@rbp/utils';
import { http, HttpResponse } from 'msw';
import { recordAudit } from '../audit';
import { type MockContext, requireFeature, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import type { SupplierRecord } from '../db/seed';
import { API, handle, MockHttpError, paginate, parseBody } from '../http';
import { nextInventoryNumber, postMovement } from '../inventory';

/**
 * PUR-001…004 purchasing. Suppliers are tenant-wide; orders and receipts belong to their
 * deliver-to location. Receiving posts PURCHASE movements — stock is never set directly.
 */

type PoRecord = PurchaseOrder & { tenantId: string };
type GrnRecord = GoodsReceipt & { tenantId: string };

const OPEN: PurchaseOrderStatus[] = ['ORDERED', 'PARTIALLY_RECEIVED'];

function purchasingContext(request: Request) {
  const ctx = resolveContext(request);
  requireFeature(ctx, 'PURCHASING');
  requirePermission(ctx, 'purchasing.manage');
  return ctx;
}

const myLocationIds = (ctx: MockContext) => ctx.me.locations.map((l) => l.id as string);

function requireLocationAccess(ctx: MockContext, locationId: string) {
  if (!myLocationIds(ctx).includes(locationId)) {
    throw new MockHttpError('FORBIDDEN', 403, 'No access to that location', {
      reason: 'LOCATION_ACCESS',
      locationId,
    });
  }
}

const publicOf = <T extends { tenantId: string }>({ tenantId: _t, ...rest }: T) => rest;

const locationName = (id: string) => db.get().locations.find((l) => l.id === id)?.name ?? id;

const money = (ctx: MockContext, amount: number) => ({ amount, currency: ctx.me.tenant.currency });

const conflict = (message: string, details: Record<string, unknown> = {}) =>
  new MockHttpError('CONFLICT', 409, message, details);

/* ---------- suppliers ---------- */

function findSupplier(ctx: MockContext, id: string) {
  const s = db.get().suppliers.find((x) => x.id === id && x.tenantId === ctx.me.tenant.id);
  if (!s) throw new MockHttpError('NOT_FOUND', 404, 'Supplier not found');
  return s;
}

/** Record plus the derived summary (open orders, last order, value received). */
function supplierOf(ctx: MockContext, s: SupplierRecord): Supplier {
  const state = db.get();
  const orders = state.purchaseOrders.filter(
    (p) => p.tenantId === ctx.me.tenant.id && p.supplierId === s.id && p.status !== 'DRAFT',
  );
  const received = state.goodsReceipts
    .filter((g) => g.tenantId === ctx.me.tenant.id && g.supplierId === s.id)
    .reduce((sum, g) => sum + g.total.amount, 0);
  const last =
    orders
      .map((o) => o.orderedAt ?? o.createdAt)
      .sort()
      .at(-1) ?? null;
  return {
    ...publicOf(s),
    openOrders: orders.filter((o) => OPEN.includes(o.status)).length,
    lastOrderAt: last,
    totalReceived: money(ctx, received),
  };
}

function saveSupplier(record: SupplierRecord) {
  db.update((d) => {
    d.suppliers = d.suppliers.map((s) => (s.id === record.id ? record : s));
  });
}

/** Optional text: '' clears the field. */
function withText<T extends object>(base: T, fields: Record<string, string | undefined>): T {
  const kept = Object.entries(base).filter(([k]) => !(k in fields));
  const set = Object.entries(fields).filter(([, v]) => !!v);
  return Object.fromEntries([...kept, ...set]) as T;
}

/* ---------- purchase orders ---------- */

function findOrder(ctx: MockContext, id: string) {
  const po = db.get().purchaseOrders.find((p) => p.id === id && p.tenantId === ctx.me.tenant.id);
  if (!po) throw new MockHttpError('NOT_FOUND', 404, 'Purchase order not found');
  requireLocationAccess(ctx, po.locationId);
  return po;
}

function saveOrder(po: PoRecord) {
  db.update((d) => {
    d.purchaseOrders = d.purchaseOrders.map((p) => (p.id === po.id ? po : p));
  });
}

function requireActiveSupplier(ctx: MockContext, supplierId: string) {
  const supplier = db
    .get()
    .suppliers.find((s) => s.id === supplierId && s.tenantId === ctx.me.tenant.id);
  if (!supplier) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Unknown supplier', {
      fieldErrors: { supplierId: 'validation.supplierRequired' },
    });
  }
  if (!supplier.isActive) {
    throw conflict(`${supplier.name} is inactive`, { reason: 'SUPPLIER_INACTIVE' });
  }
  return supplier;
}

/** Validated body → order fields (lines snapshot the product name/code/unit). */
async function orderInput(ctx: MockContext, request: Request) {
  const input = await parseBody(request, purchaseOrderSchema);
  const state = db.get();
  const supplier = requireActiveSupplier(ctx, input.supplierId);
  if (!state.locations.some((l) => l.id === input.locationId && l.tenantId === ctx.me.tenant.id)) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Unknown location', {
      fieldErrors: { locationId: 'validation.required' },
    });
  }
  requireLocationAccess(ctx, input.locationId);
  const lines = input.lines.map((l) => {
    const p = state.products.find((x) => x.id === l.productId && x.tenantId === ctx.me.tenant.id);
    if (!p) throw new MockHttpError('NOT_FOUND', 404, 'Item not found');
    return {
      productId: p.id,
      productName: p.name,
      productCode: p.code,
      unit: p.stockUnit ?? 'pcs',
      quantity: l.quantity,
      receivedQuantity: 0,
      unitCost: money(ctx, l.unitCost),
    };
  });
  return {
    place: !!input.place,
    fields: {
      supplierId: supplier.id,
      supplierName: supplier.name,
      locationId: input.locationId as PurchaseOrder['locationId'],
      lines,
      total: money(
        ctx,
        lines.reduce((s, l) => s + l.quantity * l.unitCost.amount, 0),
      ),
      ...(input.expectedDate ? { expectedDate: input.expectedDate } : {}),
      ...(input.note ? { note: input.note } : {}),
    },
  };
}

const orderLabel = (po: PurchaseOrder) =>
  `${po.number} · ${po.supplierName} → ${locationName(po.locationId)}`;

function placeOrder(ctx: MockContext, po: PoRecord) {
  requireActiveSupplier(ctx, po.supplierId);
  const placed: PoRecord = { ...po, status: 'ORDERED', orderedAt: nowIso() };
  saveOrder(placed);
  recordAudit(ctx, {
    action: 'purchasing.order.place',
    entity: 'purchase-order',
    entityId: po.id,
    entityLabel: `${orderLabel(po)} placed`,
    before: { status: po.status },
    after: { status: 'ORDERED' },
  });
  return placed;
}

export const purchasingHandlers = [
  /** PUR-001 */
  http.get(
    `${API}/suppliers`,
    handle(({ request }) => {
      const ctx = purchasingContext(request);
      const url = new URL(request.url);
      const q = url.searchParams.get('search')?.trim().toLowerCase();
      const active = url.searchParams.get('active');
      const items = db
        .get()
        .suppliers.filter(
          (s) =>
            s.tenantId === ctx.me.tenant.id &&
            (active === null || String(s.isActive) === active) &&
            (!q ||
              [s.name, s.code, s.contactName, s.phone].some((v) => v?.toLowerCase().includes(q))),
        )
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name))
        .map((s) => supplierOf(ctx, s));
      return HttpResponse.json(paginate(items, url));
    }),
  ),

  /** PUR-002 */
  http.get(
    `${API}/suppliers/:id`,
    handle(({ request, params }) => {
      const ctx = purchasingContext(request);
      return HttpResponse.json(supplierOf(ctx, findSupplier(ctx, String(params.id))));
    }),
  ),

  http.post(
    `${API}/suppliers`,
    handle(async ({ request }) => {
      const ctx = purchasingContext(request);
      const { contactName, phone, email, address, note, ...input } = await parseBody(
        request,
        supplierSchema,
      );
      const mine = db.get().suppliers.filter((s) => s.tenantId === ctx.me.tenant.id);
      if (mine.some((s) => s.name.toLowerCase() === input.name.toLowerCase())) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Supplier exists', {
          fieldErrors: { name: 'validation.supplierTaken' },
        });
      }
      const record = withText<SupplierRecord>(
        {
          id: newId('sup'),
          tenantId: ctx.me.tenant.id,
          code: `SUP-${String(mine.length + 1).padStart(3, '0')}`,
          ...input,
          isActive: true,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
        { contactName, phone: phone && (normalizePhone(phone) ?? phone), email, address, note },
      );
      db.update((d) => {
        d.suppliers.push(record);
      });
      recordAudit(ctx, {
        action: 'purchasing.supplier.create',
        entity: 'supplier',
        entityId: record.id,
        entityLabel: `${record.code} ${record.name}`,
        before: null,
        after: publicOf(record),
      });
      return HttpResponse.json(supplierOf(ctx, record), { status: 201 });
    }),
  ),

  http.patch(
    `${API}/suppliers/:id`,
    handle(async ({ request, params }) => {
      const ctx = purchasingContext(request);
      const existing = findSupplier(ctx, String(params.id));
      const { contactName, phone, email, address, note, ...input } = await parseBody(
        request,
        supplierSchema,
      );
      const taken = db
        .get()
        .suppliers.some(
          (s) =>
            s.tenantId === ctx.me.tenant.id &&
            s.id !== existing.id &&
            s.name.toLowerCase() === input.name.toLowerCase(),
        );
      if (taken) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Supplier exists', {
          fieldErrors: { name: 'validation.supplierTaken' },
        });
      }
      const updated = withText<SupplierRecord>(
        { ...existing, ...input, updatedAt: nowIso() },
        { contactName, phone: phone && (normalizePhone(phone) ?? phone), email, address, note },
      );
      saveSupplier(updated);
      recordAudit(ctx, {
        action: 'purchasing.supplier.update',
        entity: 'supplier',
        entityId: existing.id,
        entityLabel: `${updated.code} ${updated.name}`,
        before: publicOf(existing),
        after: publicOf(updated),
      });
      return HttpResponse.json(supplierOf(ctx, updated));
    }),
  ),

  /** Suppliers are never deleted: deactivate hides them from new orders. */
  ...(['activate', 'deactivate'] as const).map((verb) =>
    http.post(
      `${API}/suppliers/:id/${verb}`,
      handle(({ request, params }) => {
        const ctx = purchasingContext(request);
        const existing = findSupplier(ctx, String(params.id));
        const updated = { ...existing, isActive: verb === 'activate', updatedAt: nowIso() };
        saveSupplier(updated);
        recordAudit(ctx, {
          action: `purchasing.supplier.${verb}`,
          entity: 'supplier',
          entityId: existing.id,
          entityLabel: `${existing.code} ${existing.name} ${verb}d`,
          before: { isActive: existing.isActive },
          after: { isActive: updated.isActive },
        });
        return HttpResponse.json(supplierOf(ctx, updated));
      }),
    ),
  ),

  /** PUR-003 list: orders for the user's locations, newest first. */
  http.get(
    `${API}/purchase-orders`,
    handle(({ request }) => {
      const ctx = purchasingContext(request);
      const url = new URL(request.url);
      const p = url.searchParams;
      const mine = myLocationIds(ctx);
      const status = p.get('status');
      const open = p.get('open') === 'true';
      const supplierId = p.get('supplierId');
      const q = p.get('search')?.trim().toLowerCase();
      const items = db
        .get()
        .purchaseOrders.filter(
          (o) =>
            o.tenantId === ctx.me.tenant.id &&
            mine.includes(o.locationId) &&
            (!status || o.status === status) &&
            (!open || OPEN.includes(o.status)) &&
            (!supplierId || o.supplierId === supplierId) &&
            (!q ||
              o.number.toLowerCase().includes(q) ||
              o.supplierName.toLowerCase().includes(q) ||
              o.lines.some((l) => l.productName.toLowerCase().includes(q))),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(publicOf);
      return HttpResponse.json(paginate(items, url));
    }),
  ),

  http.get(
    `${API}/purchase-orders/:id`,
    handle(({ request, params }) => {
      const ctx = purchasingContext(request);
      return HttpResponse.json(publicOf(findOrder(ctx, String(params.id))));
    }),
  ),

  /** Create as DRAFT, or DRAFT → ORDERED in one step with `place`. */
  http.post(
    `${API}/purchase-orders`,
    handle(async ({ request }) => {
      const ctx = purchasingContext(request);
      const { place, fields } = await orderInput(ctx, request);
      const po: PoRecord = {
        id: newId('po'),
        tenantId: ctx.me.tenant.id,
        number: nextInventoryNumber(ctx, 'PO'),
        status: 'DRAFT',
        ...fields,
        createdBy: ctx.me.user.displayName,
        createdAt: nowIso(),
        receiptIds: [],
      };
      db.update((d) => {
        d.purchaseOrders.push(po);
      });
      recordAudit(ctx, {
        action: 'purchasing.order.create',
        entity: 'purchase-order',
        entityId: po.id,
        entityLabel: `${orderLabel(po)} · ${po.lines.map((l) => `${l.productName} ×${l.quantity}`).join(', ')}`,
        before: null,
        after: publicOf(po),
      });
      const result = place ? placeOrder(ctx, po) : po;
      return HttpResponse.json(publicOf(result), { status: 201 });
    }),
  ),

  /** Edit a DRAFT only; once ordered the supplier has it. */
  http.put(
    `${API}/purchase-orders/:id`,
    handle(async ({ request, params }) => {
      const ctx = purchasingContext(request);
      const existing = findOrder(ctx, String(params.id));
      if (existing.status !== 'DRAFT') {
        throw conflict(`Purchase order is ${existing.status}`, { status: existing.status });
      }
      const { place, fields } = await orderInput(ctx, request);
      const updated: PoRecord = { ...existing, ...fields };
      if (!fields.expectedDate) delete updated.expectedDate;
      if (!fields.note) delete updated.note;
      saveOrder(updated);
      recordAudit(ctx, {
        action: 'purchasing.order.update',
        entity: 'purchase-order',
        entityId: existing.id,
        entityLabel: orderLabel(updated),
        before: publicOf(existing),
        after: publicOf(updated),
      });
      const result = place ? placeOrder(ctx, updated) : updated;
      return HttpResponse.json(publicOf(result));
    }),
  ),

  http.post(
    `${API}/purchase-orders/:id/place`,
    handle(({ request, params }) => {
      const ctx = purchasingContext(request);
      const po = findOrder(ctx, String(params.id));
      if (po.status !== 'DRAFT') {
        throw conflict(`Purchase order is ${po.status}`, { status: po.status });
      }
      return HttpResponse.json(publicOf(placeOrder(ctx, po)));
    }),
  ),

  /** Only before anything has arrived; after that the receipts stand. */
  http.post(
    `${API}/purchase-orders/:id/cancel`,
    handle(async ({ request, params }) => {
      const ctx = purchasingContext(request);
      const po = findOrder(ctx, String(params.id));
      if (!['DRAFT', 'ORDERED'].includes(po.status) || po.receiptIds.length) {
        throw conflict(`Purchase order is ${po.status}`, { status: po.status });
      }
      const { reason } = await parseBody(request, cancelPurchaseOrderSchema);
      const updated: PoRecord = {
        ...po,
        status: 'CANCELLED',
        cancelledBy: ctx.me.user.displayName,
        cancelledAt: nowIso(),
        cancelReason: reason,
      };
      saveOrder(updated);
      recordAudit(ctx, {
        action: 'purchasing.order.cancel',
        entity: 'purchase-order',
        entityId: po.id,
        entityLabel: `${orderLabel(po)} cancelled · ${reason}`,
        before: { status: po.status },
        after: { status: 'CANCELLED', cancelReason: reason },
      });
      return HttpResponse.json(publicOf(updated));
    }),
  ),

  /** PUR-004 receive a delivery: a GRN plus one PURCHASE movement per item received. */
  http.post(
    `${API}/purchase-orders/:id/receipts`,
    handle(async ({ request, params }) => {
      const ctx = purchasingContext(request);
      const po = findOrder(ctx, String(params.id));
      if (!OPEN.includes(po.status)) {
        throw conflict(`Purchase order is ${po.status}`, { status: po.status });
      }
      const input = await parseBody(request, receiveGoodsSchema);
      const got = (productId: string) =>
        input.lines.find((x) => x.productId === productId)?.receivedQuantity ?? 0;
      po.lines.forEach((l, i) => {
        if (got(l.productId) > l.quantity - l.receivedQuantity) {
          throw new MockHttpError('VALIDATION_FAILED', 400, 'More than is outstanding', {
            fieldErrors: { [`lines.${i}.receivedQuantity`]: 'validation.moreThanOutstanding' },
          });
        }
      });

      const id = newId('grn');
      const number = nextInventoryNumber(ctx, 'GRN');
      const reference = { kind: 'GOODS_RECEIPT' as const, id, number };
      const grnLines = po.lines
        .filter((l) => got(l.productId) > 0)
        .map((l) => {
          const movement = postMovement(ctx, {
            productId: l.productId,
            locationId: po.locationId,
            type: 'PURCHASE',
            quantity: got(l.productId),
            reference,
            note: `${po.number} · ${po.supplierName}`,
          });
          return {
            productId: l.productId,
            productName: l.productName,
            productCode: l.productCode,
            unit: l.unit,
            orderedQuantity: l.quantity,
            receivedQuantity: got(l.productId),
            unitCost: l.unitCost,
            balanceAfter: movement.balanceAfter,
          };
        });
      const grn: GrnRecord = {
        id,
        tenantId: ctx.me.tenant.id,
        number,
        purchaseOrderId: po.id,
        purchaseOrderNumber: po.number,
        supplierId: po.supplierId,
        supplierName: po.supplierName,
        locationId: po.locationId,
        lines: grnLines,
        total: money(
          ctx,
          grnLines.reduce((s, l) => s + l.receivedQuantity * l.unitCost.amount, 0),
        ),
        ...(input.supplierInvoiceRef ? { supplierInvoiceRef: input.supplierInvoiceRef } : {}),
        ...(input.note ? { note: input.note } : {}),
        receivedBy: ctx.me.user.displayName,
        receivedAt: nowIso(),
      };
      const lines = po.lines.map((l) => ({
        ...l,
        receivedQuantity: l.receivedQuantity + got(l.productId),
      }));
      const complete = lines.every((l) => l.receivedQuantity >= l.quantity);
      const updated: PoRecord = {
        ...po,
        lines,
        status: complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
        receiptIds: [...po.receiptIds, id],
      };
      db.update((d) => {
        d.goodsReceipts.push(grn);
      });
      saveOrder(updated);
      recordAudit(ctx, {
        action: 'purchasing.goods.receive',
        entity: 'goods-receipt',
        entityId: id,
        entityLabel: `${number} for ${po.number} at ${locationName(po.locationId)} · ${grnLines.map((l) => `${l.productName} +${l.receivedQuantity}`).join(', ')}`,
        before: { status: po.status },
        after: { status: updated.status, receipt: publicOf(grn) },
      });
      return HttpResponse.json(publicOf(grn), { status: 201 });
    }),
  ),

  /** PUR-004 goods received notes at the user's locations, newest first. */
  http.get(
    `${API}/goods-receipts`,
    handle(({ request }) => {
      const ctx = purchasingContext(request);
      const url = new URL(request.url);
      const p = url.searchParams;
      const mine = myLocationIds(ctx);
      const supplierId = p.get('supplierId');
      const purchaseOrderId = p.get('purchaseOrderId');
      const q = p.get('search')?.trim().toLowerCase();
      const items = db
        .get()
        .goodsReceipts.filter(
          (g) =>
            g.tenantId === ctx.me.tenant.id &&
            mine.includes(g.locationId) &&
            (!supplierId || g.supplierId === supplierId) &&
            (!purchaseOrderId || g.purchaseOrderId === purchaseOrderId) &&
            (!q ||
              g.number.toLowerCase().includes(q) ||
              g.purchaseOrderNumber.toLowerCase().includes(q) ||
              g.supplierName.toLowerCase().includes(q) ||
              (g.supplierInvoiceRef ?? '').toLowerCase().includes(q)),
        )
        .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
        .map(publicOf);
      return HttpResponse.json(paginate(items, url));
    }),
  ),

  http.get(
    `${API}/goods-receipts/:id`,
    handle(({ request, params }) => {
      const ctx = purchasingContext(request);
      const grn = db
        .get()
        .goodsReceipts.find((g) => g.id === String(params.id) && g.tenantId === ctx.me.tenant.id);
      if (!grn) throw new MockHttpError('NOT_FOUND', 404, 'Goods receipt not found');
      requireLocationAccess(ctx, grn.locationId);
      return HttpResponse.json(publicOf(grn));
    }),
  ),
];
