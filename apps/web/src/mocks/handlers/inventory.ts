import type {
  InventoryItemDetail,
  InventoryListResponse,
  StockAdjustment,
  StockLevel,
  StockMovement,
  StockTransfer,
} from '@rbp/types';
import { newId, nowIso } from '@rbp/utils';
import {
  minStockSchema,
  receiveTransferSchema,
  stockAdjustmentSchema,
  stockTransferSchema,
} from '@rbp/validation';
import { http, HttpResponse } from 'msw';
import { recordAudit, requireVerifiedAction } from '../audit';
import { type MockContext, requireFeature, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import { API, handle, MockHttpError, paginate, parseBody } from '../http';
import {
  levelFor,
  nextInventoryNumber,
  onHand,
  onHandIndex,
  postMovement,
  settingKey,
  trackedPairs,
} from '../inventory';

/**
 * INV-001…006 basic inventory. Every change is a stock movement; balances are derived.
 * Lists are newest first; movements at the same instant keep their posting order (reversed).
 */

function inventoryContext(
  request: Request,
  permission: 'inventory.view' | 'inventory.adjust' | 'inventory.transfer' = 'inventory.view',
) {
  const ctx = resolveContext(request, { requireLocation: true });
  requireFeature(ctx, 'INVENTORY');
  requirePermission(ctx, permission);
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

function levelsFor(ctx: MockContext, locationIds: string[]): StockLevel[] {
  const state = db.get();
  const index = onHandIndex(state, ctx.me.tenant.id);
  return trackedPairs(state, ctx.me.tenant.id, locationIds)
    .map(({ productId, locationId }) =>
      levelFor(state, ctx.me.tenant.id, productId, locationId, index),
    )
    .filter((l): l is StockLevel => !!l)
    .sort((a, b) => a.name.localeCompare(b.name) || a.locationId.localeCompare(b.locationId));
}

function findTransfer(ctx: MockContext, id: string) {
  const transfer = db
    .get()
    .stockTransfers.find((t) => t.id === id && t.tenantId === ctx.me.tenant.id);
  if (!transfer) throw new MockHttpError('NOT_FOUND', 404, 'Transfer not found');
  return transfer;
}

function saveTransfer(transfer: StockTransfer & { tenantId: string }) {
  db.update((d) => {
    d.stockTransfers = d.stockTransfers.map((t) => (t.id === transfer.id ? transfer : t));
  });
}

export const inventoryHandlers = [
  /** INV-001 stock overview. */
  http.get(
    `${API}/inventory`,
    handle(({ request }) => {
      const ctx = inventoryContext(request);
      const url = new URL(request.url);
      const p = url.searchParams;
      const locationParam = p.get('locationId') ?? ctx.me.currentLocation!.id;
      const locations = locationParam === 'all' ? myLocationIds(ctx) : [locationParam];
      if (locationParam !== 'all') requireLocationAccess(ctx, locationParam);
      const all = levelsFor(ctx, locations);
      const q = p.get('search')?.trim().toLowerCase();
      const status = p.get('status');
      const categoryId = p.get('categoryId');
      const items = all.filter(
        (l) =>
          (!q || l.name.toLowerCase().includes(q) || l.code.toLowerCase().includes(q)) &&
          (!status || l.status === status) &&
          (!categoryId || l.categoryId === categoryId),
      );
      const body: InventoryListResponse = {
        ...paginate(items, url),
        summary: {
          tracked: all.length,
          low: all.filter((l) => l.status === 'LOW').length,
          out: all.filter((l) => l.status === 'OUT').length,
        },
      };
      return HttpResponse.json(body);
    }),
  ),

  /** INV-006 low / out of stock at every location the user can access, most short first. */
  http.get(
    `${API}/inventory/low-stock`,
    handle(({ request }) => {
      const ctx = inventoryContext(request);
      const rows = levelsFor(ctx, myLocationIds(ctx))
        .filter((l) => l.status !== 'OK')
        .sort(
          (a, b) =>
            Number(b.status === 'OUT') - Number(a.status === 'OUT') ||
            b.minStock - b.onHand - (a.minStock - a.onHand),
        );
      return HttpResponse.json(rows);
    }),
  ),

  /** INV-002 one item at every location + recent movements. */
  http.get(
    `${API}/inventory/:productId`,
    handle(({ request, params }) => {
      const ctx = inventoryContext(request);
      const state = db.get();
      const product = state.products.find(
        (x) => x.id === params.productId && x.tenantId === ctx.me.tenant.id,
      );
      if (!product) throw new MockHttpError('NOT_FOUND', 404, 'Item not found');
      const mine = myLocationIds(ctx);
      const levels = levelsFor(ctx, mine).filter((l) => l.productId === product.id);
      const recent = state.stockMovements
        .filter(
          (m) =>
            m.tenantId === ctx.me.tenant.id &&
            m.productId === product.id &&
            mine.includes(m.locationId),
        )
        .reverse()
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 20)
        .map(publicOf);
      const body: InventoryItemDetail = {
        productId: product.id,
        code: product.code,
        name: product.name,
        unit: product.stockUnit ?? 'pcs',
        categoryId: product.categoryId,
        levels,
        recent,
      };
      return HttpResponse.json(body);
    }),
  ),

  /** Minimum stock for low-stock alerts (configuration; audited, no PIN). */
  http.patch(
    `${API}/inventory/:productId/levels/:locationId`,
    handle(async ({ request, params }) => {
      const ctx = inventoryContext(request, 'inventory.adjust');
      const productId = String(params.productId);
      const locationId = String(params.locationId);
      requireLocationAccess(ctx, locationId);
      const { minStock } = await parseBody(request, minStockSchema);
      const key = settingKey(productId, locationId);
      const before = db.get().stockSettings[key]?.minStock ?? 0;
      db.update((d) => {
        d.stockSettings[key] = { minStock };
      });
      const level = levelFor(db.get(), ctx.me.tenant.id, productId, locationId);
      if (!level) throw new MockHttpError('NOT_FOUND', 404, 'Item not found');
      recordAudit(ctx, {
        action: 'inventory.min-stock',
        entity: 'product',
        entityId: productId,
        entityLabel: `${level.name} @ ${locationName(locationId)} minimum ${before} → ${minStock}`,
        before: { minStock: before },
        after: { minStock },
      });
      return HttpResponse.json(level);
    }),
  ),

  /** INV-003 the ledger. */
  http.get(
    `${API}/stock-movements`,
    handle(({ request }) => {
      const ctx = inventoryContext(request);
      const url = new URL(request.url);
      const p = url.searchParams;
      const mine = myLocationIds(ctx);
      const locationId = p.get('locationId');
      if (locationId) requireLocationAccess(ctx, locationId);
      const productId = p.get('productId');
      const type = p.get('type');
      const from = p.get('from');
      const items: StockMovement[] = db
        .get()
        .stockMovements.filter(
          (m) =>
            m.tenantId === ctx.me.tenant.id &&
            (locationId ? m.locationId === locationId : mine.includes(m.locationId)) &&
            (!productId || m.productId === productId) &&
            (!type || m.type === type) &&
            (!from || m.at >= from),
        )
        .reverse()
        .sort((a, b) => b.at.localeCompare(a.at))
        .map(publicOf);
      return HttpResponse.json(paginate(items, url));
    }),
  ),

  /** INV-004 recent adjustments. */
  http.get(
    `${API}/stock-adjustments`,
    handle(({ request }) => {
      const ctx = inventoryContext(request);
      const url = new URL(request.url);
      const locationId = url.searchParams.get('locationId');
      const mine = myLocationIds(ctx);
      const items = db
        .get()
        .stockAdjustments.filter(
          (a) =>
            a.tenantId === ctx.me.tenant.id &&
            (locationId ? a.locationId === locationId : mine.includes(a.locationId)),
        )
        .reverse()
        .sort((a, b) => b.at.localeCompare(a.at))
        .map(publicOf);
      return HttpResponse.json(paginate(items, url));
    }),
  ),

  /**
   * INV-004 / FLOW-INV-001: item → adjustment → quantity → employee PIN → reason →
   * stock movement → audit.
   */
  http.post(
    `${API}/stock-adjustments`,
    handle(async ({ request }) => {
      const ctx = inventoryContext(request, 'inventory.adjust');
      const input = await parseBody(request, stockAdjustmentSchema);
      requireLocationAccess(ctx, input.locationId);
      const state = db.get();
      const product = state.products.find(
        (x) => x.id === input.productId && x.tenantId === ctx.me.tenant.id,
      );
      if (!product) throw new MockHttpError('NOT_FOUND', 404, 'Item not found');
      const before = onHand(state, ctx.me.tenant.id, product.id, input.locationId);
      const delta =
        input.kind === 'COUNT'
          ? input.quantity - before
          : input.kind === 'ADD'
            ? input.quantity
            : -input.quantity;
      if (delta === 0) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Count matches stock', {
          fieldErrors: { quantity: 'validation.noStockChange' },
        });
      }
      if (before + delta < 0) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'More than is in stock', {
          fieldErrors: { quantity: 'validation.belowZero' },
          onHand: before,
        });
      }
      const verified = requireVerifiedAction(ctx, input.verification, 'inventory.adjust');
      const id = newId('adj');
      const number = nextInventoryNumber(ctx, 'ADJ');
      const movement = postMovement(ctx, {
        productId: product.id,
        locationId: input.locationId,
        type:
          input.kind === 'WASTAGE'
            ? 'WASTAGE'
            : input.kind === 'STAFF_MEAL'
              ? 'STAFF_MEAL'
              : 'ADJUSTMENT',
        quantity: delta,
        reference: { kind: 'ADJUSTMENT', id, number },
        reason: verified.reason,
        approvedBy: verified.employee.fullName,
        ...(input.note ? { note: input.note } : {}),
      });
      const adjustment: StockAdjustment = {
        id,
        number,
        productId: product.id,
        productName: product.name,
        unit: product.stockUnit ?? 'pcs',
        locationId: input.locationId as StockAdjustment['locationId'],
        kind: input.kind,
        quantity: input.quantity,
        before,
        after: movement.balanceAfter,
        movementId: movement.id,
        reason: verified.reason,
        approvedBy: verified.employee.fullName,
        createdBy: ctx.me.user.displayName,
        at: movement.at,
      };
      db.update((d) => {
        d.stockAdjustments.push({ ...adjustment, tenantId: ctx.me.tenant.id });
      });
      recordAudit(ctx, {
        action: 'inventory.adjust',
        entity: 'product',
        entityId: product.id,
        entityLabel: `${number} · ${product.name} @ ${locationName(input.locationId)} · ${input.kind.replace('_', ' ').toLowerCase()} ${before} → ${adjustment.after}`,
        before: { onHand: before },
        after: { onHand: adjustment.after, kind: input.kind },
        verified,
      });
      return HttpResponse.json(adjustment, { status: 201 });
    }),
  ),

  /** INV-005 list, relative to the current location. */
  http.get(
    `${API}/stock-transfers`,
    handle(({ request }) => {
      const ctx = inventoryContext(request);
      const url = new URL(request.url);
      const p = url.searchParams;
      const here = ctx.me.currentLocation!.id as string;
      const mine = myLocationIds(ctx);
      const direction = p.get('direction');
      const status = p.get('status');
      const items = db
        .get()
        .stockTransfers.filter(
          (t) =>
            t.tenantId === ctx.me.tenant.id &&
            (direction === 'in'
              ? t.toLocationId === here
              : direction === 'out'
                ? t.fromLocationId === here
                : mine.includes(t.fromLocationId) || mine.includes(t.toLocationId)) &&
            (!status || t.status === status),
        )
        .sort((a, b) => b.dispatchedAt.localeCompare(a.dispatchedAt))
        .map(publicOf);
      return HttpResponse.json(paginate(items, url));
    }),
  ),

  http.get(
    `${API}/stock-transfers/:id`,
    handle(({ request, params }) => {
      const ctx = inventoryContext(request);
      return HttpResponse.json(publicOf(findTransfer(ctx, String(params.id))));
    }),
  ),

  /** INV-005 dispatch: stock leaves the sender now (TRANSFER_OUT). */
  http.post(
    `${API}/stock-transfers`,
    handle(async ({ request }) => {
      const ctx = inventoryContext(request, 'inventory.transfer');
      const input = await parseBody(request, stockTransferSchema);
      requireLocationAccess(ctx, input.fromLocationId);
      const state = db.get();
      if (
        !state.locations.some((l) => l.id === input.toLocationId && l.tenantId === ctx.me.tenant.id)
      ) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Unknown location', {
          fieldErrors: { toLocationId: 'validation.required' },
        });
      }
      const lines = input.lines.map((l) => {
        const product = state.products.find(
          (x) => x.id === l.productId && x.tenantId === ctx.me.tenant.id,
        );
        if (!product) throw new MockHttpError('NOT_FOUND', 404, 'Item not found');
        return {
          productId: product.id,
          code: product.code,
          name: product.name,
          unit: product.stockUnit ?? 'pcs',
          quantity: l.quantity,
        };
      });
      const short = lines.filter(
        (l) => l.quantity > onHand(state, ctx.me.tenant.id, l.productId, input.fromLocationId),
      );
      if (short.length) {
        throw new MockHttpError('CONFLICT', 409, 'Not enough stock to send', {
          reason: 'OUT_OF_STOCK',
          items: short.map((l) => ({
            productId: l.productId,
            name: l.name,
            onHand: onHand(state, ctx.me.tenant.id, l.productId, input.fromLocationId),
          })),
        });
      }
      const id = newId('trf');
      const number = nextInventoryNumber(ctx, 'TRF');
      const reference = { kind: 'TRANSFER' as const, id, number };
      for (const l of lines) {
        postMovement(ctx, {
          productId: l.productId,
          locationId: input.fromLocationId,
          type: 'TRANSFER_OUT',
          quantity: -l.quantity,
          reference,
          note: `To ${locationName(input.toLocationId)}`,
        });
      }
      const transfer: StockTransfer & { tenantId: string } = {
        id,
        tenantId: ctx.me.tenant.id,
        number,
        fromLocationId: input.fromLocationId as StockTransfer['fromLocationId'],
        toLocationId: input.toLocationId as StockTransfer['toLocationId'],
        status: 'IN_TRANSIT',
        lines,
        ...(input.note ? { note: input.note } : {}),
        dispatchedBy: ctx.me.user.displayName,
        dispatchedAt: nowIso(),
      };
      db.update((d) => {
        d.stockTransfers.push(transfer);
      });
      recordAudit(ctx, {
        action: 'inventory.transfer.dispatch',
        entity: 'stock-transfer',
        entityId: id,
        entityLabel: `${number} · ${locationName(input.fromLocationId)} → ${locationName(input.toLocationId)} · ${lines.map((l) => `${l.name} ×${l.quantity}`).join(', ')}`,
        before: null,
        after: publicOf(transfer),
      });
      return HttpResponse.json(publicOf(transfer), { status: 201 });
    }),
  ),

  /** INV-005 receive at the destination (TRANSFER_IN); shortages are recorded. */
  http.post(
    `${API}/stock-transfers/:id/receive`,
    handle(async ({ request, params }) => {
      const ctx = inventoryContext(request, 'inventory.transfer');
      const transfer = findTransfer(ctx, String(params.id));
      requireLocationAccess(ctx, transfer.toLocationId);
      // Stock is counted in by whoever is at the destination, not by the sender (or any other
      // location the user can see) on their behalf.
      if (ctx.me.currentLocation!.id !== transfer.toLocationId) {
        throw new MockHttpError('FORBIDDEN', 403, 'Transfers are received at the destination', {
          reason: 'NOT_DESTINATION',
          locationId: transfer.toLocationId,
        });
      }
      if (transfer.status !== 'IN_TRANSIT') {
        throw new MockHttpError('CONFLICT', 409, `Transfer is ${transfer.status}`, {
          status: transfer.status,
        });
      }
      const input = await parseBody(request, receiveTransferSchema);
      const reference = { kind: 'TRANSFER' as const, id: transfer.id, number: transfer.number };
      const lines = transfer.lines.map((l) => {
        const got =
          input.lines.find((x) => x.productId === l.productId)?.receivedQuantity ?? l.quantity;
        if (got > l.quantity) {
          throw new MockHttpError('VALIDATION_FAILED', 400, 'More than was sent', {
            fieldErrors: { lines: 'validation.moreThanSent' },
          });
        }
        return { ...l, receivedQuantity: got };
      });
      for (const l of lines.filter((x) => x.receivedQuantity > 0)) {
        postMovement(ctx, {
          productId: l.productId,
          locationId: transfer.toLocationId,
          type: 'TRANSFER_IN',
          quantity: l.receivedQuantity,
          reference,
          note: `From ${locationName(transfer.fromLocationId)}`,
        });
      }
      const updated = {
        ...transfer,
        lines,
        status: 'RECEIVED' as const,
        receivedBy: ctx.me.user.displayName,
        receivedAt: nowIso(),
      };
      saveTransfer(updated);
      const short = lines.filter((l) => l.receivedQuantity < l.quantity);
      recordAudit(ctx, {
        action: 'inventory.transfer.receive',
        entity: 'stock-transfer',
        entityId: transfer.id,
        entityLabel: `${transfer.number} received at ${locationName(transfer.toLocationId)}${
          short.length
            ? ` · ${short.map((l) => `${l.name} ${l.quantity - l.receivedQuantity} short`).join(', ')}`
            : ''
        }`,
        before: { status: 'IN_TRANSIT' },
        after: { status: 'RECEIVED', lines },
      });
      return HttpResponse.json(publicOf(updated));
    }),
  ),

  /** Cancel while in transit: the stock goes back to the sender. */
  http.post(
    `${API}/stock-transfers/:id/cancel`,
    handle(({ request, params }) => {
      const ctx = inventoryContext(request, 'inventory.transfer');
      const transfer = findTransfer(ctx, String(params.id));
      requireLocationAccess(ctx, transfer.fromLocationId);
      if (ctx.me.currentLocation!.id !== transfer.fromLocationId) {
        throw new MockHttpError('FORBIDDEN', 403, 'Transfers are cancelled by the sender', {
          reason: 'NOT_SENDER',
          locationId: transfer.fromLocationId,
        });
      }
      if (transfer.status !== 'IN_TRANSIT') {
        throw new MockHttpError('CONFLICT', 409, `Transfer is ${transfer.status}`, {
          status: transfer.status,
        });
      }
      const reference = { kind: 'TRANSFER' as const, id: transfer.id, number: transfer.number };
      for (const l of transfer.lines) {
        postMovement(ctx, {
          productId: l.productId,
          locationId: transfer.fromLocationId,
          type: 'TRANSFER_IN',
          quantity: l.quantity,
          reference,
          note: 'Transfer cancelled — back to stock',
        });
      }
      const updated = {
        ...transfer,
        status: 'CANCELLED' as const,
        cancelledBy: ctx.me.user.displayName,
        cancelledAt: nowIso(),
      };
      saveTransfer(updated);
      recordAudit(ctx, {
        action: 'inventory.transfer.cancel',
        entity: 'stock-transfer',
        entityId: transfer.id,
        entityLabel: `${transfer.number} cancelled`,
        before: { status: 'IN_TRANSIT' },
        after: { status: 'CANCELLED' },
      });
      return HttpResponse.json(publicOf(updated));
    }),
  ),
];
