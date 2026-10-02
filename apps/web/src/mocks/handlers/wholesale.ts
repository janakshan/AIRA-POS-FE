import type {
  FeatureCode,
  RouteOverview,
  StockMovement,
  WholesaleCollection,
  WholesaleProduct,
  WholesaleReturn,
  WholesaleReturnDetail,
  WholesaleRoute,
  WholesaleShopListResponse,
} from '@rbp/types';
import {
  shareInvoiceSchema,
  wholesaleCollectionSchema,
  wholesaleInvoiceSchema,
  wholesaleReturnSchema,
  wholesaleShopSchema,
} from '@rbp/validation';
import { newId, nowIso } from '@rbp/utils';
import { http, HttpResponse } from 'msw';
import { recordAudit, requireVerifiedAction } from '../audit';
import { type MockContext, requireFeature, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import type { MockDb, WholesaleInvoiceRecord, WholesaleShopRecord } from '../db/seed';
import { API, handle, MockHttpError, parseBody } from '../http';
import {
  assertInStock,
  nextInventoryNumber,
  onHandIndex,
  postMovement,
  settingKey,
} from '../inventory';
import { locationName, requireLocationAccess } from '../location';
import {
  addDays,
  allocate,
  includedTax,
  invoiceView,
  ledgerOf,
  localDate,
  openItems,
  outstandingOf,
  shopView,
} from '../wholesale';
import { phoneMatches } from './customers';

/**
 * WHO-001…006 (prototype, FLOW-WHO-001): shop → products (van stock) → invoice → paid now
 * and/or credit → collection → return (PIN) → share/print. Nothing is deleted.
 */

function wholesaleContext(request: Request, feature: FeatureCode = 'WHOLESALE') {
  const ctx = resolveContext(request);
  requireFeature(ctx, feature);
  requirePermission(ctx, 'wholesale.manage');
  return ctx;
}

const currencyOf = (ctx: MockContext) => ctx.me.tenant.currency;
const money = (ctx: MockContext, amount: number) => ({ amount, currency: currencyOf(ctx) });

const routesOf = (state: MockDb, tenantId: string) =>
  state.wholesaleRoutes.filter((r) => r.tenantId === tenantId);

const shopsOf = (state: MockDb, tenantId: string) =>
  state.wholesaleShops.filter((s) => s.tenantId === tenantId);

function routeView(state: MockDb, r: MockDb['wholesaleRoutes'][number]): WholesaleRoute {
  const { tenantId, ...rest } = r;
  return {
    ...rest,
    shopCount: shopsOf(state, tenantId).filter((s) => s.routeId === r.id && s.isActive).length,
  };
}

function findShop(ctx: MockContext, id: string) {
  const s = shopsOf(db.get(), ctx.me.tenant.id).find((x) => x.id === id);
  if (!s) throw new MockHttpError('NOT_FOUND', 404, 'Shop not found');
  return s;
}

function findInvoice(ctx: MockContext, id: string) {
  const i = db.get().wholesaleInvoices.find((x) => x.id === id && x.tenantId === ctx.me.tenant.id);
  if (!i) throw new MockHttpError('NOT_FOUND', 404, 'Invoice not found');
  return i;
}

/** The van a shop's goods come from: its route's van. */
function vanFor(ctx: MockContext, shop: WholesaleShopRecord, requested?: string) {
  const state = db.get();
  const route = routesOf(state, ctx.me.tenant.id).find((r) => r.id === shop.routeId);
  const current = ctx.me.currentLocation;
  const id =
    requested ??
    route?.vanLocationId ??
    (current?.type === 'VAN' ? current.id : undefined) ??
    state.locations.find((l) => l.tenantId === ctx.me.tenant.id && l.type === 'VAN')?.id;
  if (!id) throw new MockHttpError('VALIDATION_FAILED', 400, 'No van to sell from');
  requireLocationAccess(ctx, id);
  if (state.locations.find((l) => l.id === id)?.type !== 'VAN') {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Sell from a van', {
      fieldErrors: { locationId: 'validation.vanRequired' },
    });
  }
  return id;
}

/** `?locationId=` or the current van or the first van. */
function vanParam(ctx: MockContext, url: URL) {
  const state = db.get();
  const id =
    url.searchParams.get('locationId') ??
    (ctx.me.currentLocation?.type === 'VAN' ? ctx.me.currentLocation.id : undefined) ??
    state.locations.find((l) => l.tenantId === ctx.me.tenant.id && l.type === 'VAN')?.id;
  if (!id) throw new MockHttpError('VALIDATION_FAILED', 400, 'No van');
  requireLocationAccess(ctx, id);
  return id;
}

const priceOf = (ctx: MockContext, productId: string) =>
  db.get().wholesalePrices[ctx.me.tenant.id]?.[productId];

function productsAt(ctx: MockContext, locationId: string): WholesaleProduct[] {
  const state = db.get();
  const index = onHandIndex(state, ctx.me.tenant.id);
  return Object.entries(state.wholesalePrices[ctx.me.tenant.id] ?? {})
    .map(([productId, price]) => {
      const p = state.products.find((x) => x.id === productId)!;
      return {
        productId,
        code: p.code,
        name: p.name,
        unit: p.stockUnit ?? 'pcs',
        price: money(ctx, price),
        retailPrice: p.basePrice,
        onHand: Math.max(0, index.qty.get(settingKey(productId, locationId)) ?? 0),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

const sameDay = (at: string, date: string | null) => !date || localDate(at) === date;
const within = (at: string, days: string | null) => {
  if (days === null) return true;
  const d = new Date();
  d.setDate(d.getDate() - Number(days));
  d.setHours(0, 0, 0, 0);
  return at >= d.toISOString();
};

const shopRecordFrom = (
  input: ReturnType<typeof wholesaleShopSchema.parse>,
): Pick<
  WholesaleShopRecord,
  | 'name'
  | 'ownerName'
  | 'phones'
  | 'address'
  | 'area'
  | 'routeId'
  | 'creditLimit'
  | 'paymentTermsDays'
  | 'notes'
> => ({
  name: input.name,
  ...(input.ownerName ? { ownerName: input.ownerName } : {}),
  phones: input.phones.map((p) => ({
    number: p.number,
    primary: p.primary,
    ...(p.label ? { label: p.label } : {}),
  })),
  ...(input.address ? { address: input.address } : {}),
  ...(input.area ? { area: input.area } : {}),
  routeId: input.routeId ?? null,
  creditLimit: { amount: input.creditLimit, currency: 'LKR' },
  paymentTermsDays: input.paymentTermsDays,
  ...(input.notes ? { notes: input.notes } : {}),
});

/**
 * WHO-001: one shop per name (case-insensitive) and per phone number within a tenant, so the same
 * shop can't be added twice under a new code. Both clashes are reported as field errors.
 */
function assertShopUnique(
  ctx: MockContext,
  input: ReturnType<typeof wholesaleShopSchema.parse>,
  exceptId?: string,
) {
  const others = shopsOf(db.get(), ctx.me.tenant.id).filter((s) => s.id !== exceptId);
  const name = input.name.trim().toLocaleLowerCase();
  const fieldErrors: Record<string, string> = {};
  if (others.some((s) => s.name.trim().toLocaleLowerCase() === name)) {
    fieldErrors.name = 'validation.shopNameTaken';
  }
  // Both sides are normalised E.164 (+94…) by the shared phone schema, so "077 110 0101" and
  // "+94771100101" compare equal.
  const taken = input.phones.findIndex((p) =>
    others.some((s) => s.phones.some((x) => x.number === p.number)),
  );
  if (taken >= 0) fieldErrors[`phones.${taken}.number`] = 'validation.shopPhoneTaken';
  if (Object.keys(fieldErrors).length > 0) {
    throw new MockHttpError('CONFLICT', 409, 'A shop with this name or phone already exists', {
      fieldErrors,
    });
  }
}

export const wholesaleHandlers = [
  http.get(
    `${API}/wholesale/routes`,
    handle(({ request }) => {
      const ctx = wholesaleContext(request);
      const state = db.get();
      return HttpResponse.json(routesOf(state, ctx.me.tenant.id).map((r) => routeView(state, r)));
    }),
  ),

  /** WHO-006 one route on one day. */
  http.get(
    `${API}/wholesale/routes/:id/overview`,
    handle(({ request, params }) => {
      const ctx = wholesaleContext(request);
      const state = db.get();
      const route = routesOf(state, ctx.me.tenant.id).find((r) => r.id === params.id);
      if (!route) throw new MockHttpError('NOT_FOUND', 404, 'Route not found');
      const date = new URL(request.url).searchParams.get('date') ?? localDate(new Date());
      const [y, mo, d] = date.split('-').map(Number);
      const weekday = new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1).getDay();
      const tenantId = ctx.me.tenant.id;
      const onDay = <T extends { shopId: string; at: string }>(docs: T[], shopId: string) =>
        docs.filter((x) => x.shopId === shopId && localDate(x.at) === date);
      const invoices = state.wholesaleInvoices.filter((i) => i.tenantId === tenantId);
      const collections = state.wholesaleCollections.filter((c) => c.tenantId === tenantId);
      const returns = state.wholesaleReturns.filter((r) => r.tenantId === tenantId);
      const sum = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
      const stops = shopsOf(state, tenantId)
        .filter((s) => s.routeId === route.id && s.isActive)
        .sort((a, b) => a.stopOrder - b.stopOrder)
        .map((s) => {
          const inv = onDay(invoices, s.id);
          const col = onDay(collections, s.id);
          const ret = onDay(returns, s.id);
          return {
            shop: shopView(state, s),
            visited: inv.length + col.length + ret.length > 0,
            sales: money(ctx, sum(inv.map((i) => i.total))),
            collected: money(ctx, sum(col.map((c) => c.amount))),
            returns: money(ctx, sum(ret.map((r) => r.credit))),
            invoiceIds: inv.map((i) => i.id),
            cashAtSale: sum(inv.map((i) => i.paidNow?.amount ?? { amount: 0 })),
            credit: sum(inv.map((i) => i.credit)),
          };
        });
      const total = (f: (s: (typeof stops)[number]) => number) =>
        money(
          ctx,
          stops.reduce((n, s) => n + f(s), 0),
        );
      const van = route.vanLocationId;
      const body: RouteOverview = {
        route: routeView(state, route),
        date,
        scheduled: route.days.includes(weekday),
        stops: stops.map(({ cashAtSale: _c, credit: _k, ...s }) => s),
        totals: {
          sales: total((s) => s.sales.amount),
          cashAtSale: total((s) => s.cashAtSale),
          collected: total((s) => s.collected.amount),
          creditGiven: total((s) => s.credit),
          returns: total((s) => s.returns.amount),
          visited: stops.filter((s) => s.visited).length,
        },
        van: {
          locationId: van,
          name: locationName(van),
          items: productsAt(ctx, van).map((p) => ({
            productId: p.productId,
            name: p.name,
            unit: p.unit,
            onHand: p.onHand,
          })),
        },
      };
      return HttpResponse.json(body);
    }),
  ),

  /** WHO-001 */
  http.get(
    `${API}/wholesale/shops`,
    handle(({ request }) => {
      const ctx = wholesaleContext(request);
      const url = new URL(request.url);
      const q = url.searchParams.get('search')?.trim().toLowerCase();
      const routeId = url.searchParams.get('routeId');
      const balance = url.searchParams.get('balance');
      const state = db.get();
      const all = shopsOf(state, ctx.me.tenant.id)
        .filter((s) => !routeId || s.routeId === routeId)
        .map((s) => shopView(state, s))
        .sort(
          (a, b) =>
            (a.routeId ?? '').localeCompare(b.routeId ?? '') ||
            a.stopOrder - b.stopOrder ||
            a.name.localeCompare(b.name),
        );
      // Phones are stored +94…; match a phone-looking search by digits, local or international
      // (a code like "SHP-001" isn't a phone number).
      const digits = q && /^[\d\s+().-]+$/.test(q) ? q.replace(/\D/g, '') : undefined;
      const searched = all.filter(
        (s) =>
          !q ||
          [s.name, s.code, s.ownerName ?? '', s.area ?? ''].some((v) =>
            v.toLowerCase().includes(q),
          ) ||
          s.phones.some((p) => phoneMatches(p.number, digits)),
      );
      const items = searched.filter(
        (s) =>
          !balance ||
          (balance === 'OWES' && s.outstanding.amount > 0) ||
          (balance === 'OVER_LIMIT' && s.overLimit) ||
          (balance === 'OVERDUE' && s.overdue.amount > 0),
      );
      const body: WholesaleShopListResponse = {
        items,
        summary: {
          shops: searched.length,
          outstanding: money(
            ctx,
            searched.reduce((n, s) => n + Math.max(0, s.outstanding.amount), 0),
          ),
          overdue: money(
            ctx,
            searched.reduce((n, s) => n + s.overdue.amount, 0),
          ),
          overLimit: searched.filter((s) => s.overLimit).length,
        },
      };
      return HttpResponse.json(body);
    }),
  ),

  http.get(
    `${API}/wholesale/shops/:id`,
    handle(({ request, params }) => {
      const ctx = wholesaleContext(request);
      return HttpResponse.json(shopView(db.get(), findShop(ctx, String(params.id))));
    }),
  ),

  http.get(
    `${API}/wholesale/shops/:id/ledger`,
    handle(({ request, params }) => {
      const ctx = wholesaleContext(request);
      return HttpResponse.json(ledgerOf(db.get(), findShop(ctx, String(params.id))));
    }),
  ),

  http.post(
    `${API}/wholesale/shops`,
    handle(async ({ request }) => {
      const ctx = wholesaleContext(request);
      const input = await parseBody(request, wholesaleShopSchema);
      const state = db.get();
      if (input.routeId && !routesOf(state, ctx.me.tenant.id).some((r) => r.id === input.routeId)) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Unknown route', {
          fieldErrors: { routeId: 'validation.required' },
        });
      }
      assertShopUnique(ctx, input);
      const shops = shopsOf(state, ctx.me.tenant.id);
      const now = nowIso();
      const record: WholesaleShopRecord = {
        id: newId('shp'),
        tenantId: ctx.me.tenant.id,
        code: `SHP-${String(shops.length + 1).padStart(3, '0')}`,
        ...shopRecordFrom(input),
        creditLimit: money(ctx, input.creditLimit),
        stopOrder:
          Math.max(0, ...shops.filter((s) => s.routeId === input.routeId).map((s) => s.stopOrder)) +
          1,
        isActive: input.isActive ?? true,
        createdAt: now,
        openingBalance: 0,
        openingAt: now,
      };
      db.update((d) => {
        d.wholesaleShops.push(record);
      });
      recordAudit(ctx, {
        action: 'wholesale.shop.create',
        entity: 'wholesale-shop',
        entityId: record.id,
        entityLabel: `${record.code} ${record.name}`,
        before: null,
        after: record,
      });
      return HttpResponse.json(shopView(db.get(), record), { status: 201 });
    }),
  ),

  http.put(
    `${API}/wholesale/shops/:id`,
    handle(async ({ request, params }) => {
      const ctx = wholesaleContext(request);
      const before = findShop(ctx, String(params.id));
      const input = await parseBody(request, wholesaleShopSchema);
      assertShopUnique(ctx, input, before.id);
      const { ownerName: _o, address: _a, area: _r, notes: _n, ...base } = before;
      const record: WholesaleShopRecord = {
        ...base,
        ...shopRecordFrom(input),
        creditLimit: money(ctx, input.creditLimit),
        isActive: input.isActive ?? before.isActive,
      };
      db.update((d) => {
        d.wholesaleShops = d.wholesaleShops.map((s) => (s.id === before.id ? record : s));
      });
      recordAudit(ctx, {
        action: 'wholesale.shop.update',
        entity: 'wholesale-shop',
        entityId: record.id,
        entityLabel: `${record.code} ${record.name}`,
        before,
        after: record,
      });
      return HttpResponse.json(shopView(db.get(), record));
    }),
  ),

  /** Wholesale prices with what's in the van. */
  http.get(
    `${API}/wholesale/products`,
    handle(({ request }) => {
      const ctx = wholesaleContext(request);
      return HttpResponse.json(productsAt(ctx, vanParam(ctx, new URL(request.url))));
    }),
  ),

  http.get(
    `${API}/wholesale/invoices`,
    handle(({ request }) => {
      const ctx = wholesaleContext(request);
      const url = new URL(request.url);
      const shopId = url.searchParams.get('shopId');
      const routeId = url.searchParams.get('routeId');
      const date = url.searchParams.get('date');
      const status = url.searchParams.get('status');
      const state = db.get();
      const items = state.wholesaleInvoices
        .filter(
          (i) =>
            i.tenantId === ctx.me.tenant.id &&
            (!shopId || i.shopId === shopId) &&
            (!routeId || i.routeId === routeId) &&
            sameDay(i.at, date),
        )
        .map((i) => invoiceView(state, i))
        .filter((i) => !status || i.status === status)
        .sort((a, b) => b.at.localeCompare(a.at));
      return HttpResponse.json(items);
    }),
  ),

  http.get(
    `${API}/wholesale/invoices/:id`,
    handle(({ request, params }) => {
      const ctx = wholesaleContext(request);
      return HttpResponse.json(invoiceView(db.get(), findInvoice(ctx, String(params.id))));
    }),
  ),

  /**
   * WHO-003 / FLOW-WHO-001: goods leave the van (SALE); what isn't paid now goes on the shop's
   * balance. Going over the credit limit is allowed and flagged (your decision: warn only).
   */
  http.post(
    `${API}/wholesale/invoices`,
    handle(async ({ request }) => {
      const ctx = wholesaleContext(request, 'FIELD_SALES');
      requireFeature(ctx, 'WHOLESALE');
      const input = await parseBody(request, wholesaleInvoiceSchema);
      const shop = findShop(ctx, input.shopId);
      if (!shop.isActive) {
        throw new MockHttpError('CONFLICT', 409, 'Shop is inactive', { reason: 'SHOP_INACTIVE' });
      }
      const van = vanFor(ctx, shop, input.locationId);
      const state = db.get();
      const lines = input.lines.map((l, i) => {
        const price = priceOf(ctx, l.productId);
        if (price === undefined) {
          throw new MockHttpError('VALIDATION_FAILED', 400, 'No wholesale price for that item', {
            fieldErrors: { [`lines.${i}.productId`]: 'validation.itemRequired' },
          });
        }
        const p = state.products.find((x) => x.id === l.productId)!;
        return {
          productId: p.id,
          code: p.code,
          name: p.name,
          unit: p.stockUnit ?? ('pcs' as const),
          quantity: l.quantity,
          unitPrice: money(ctx, price),
          lineTotal: money(ctx, price * l.quantity),
          returnedQuantity: 0,
        };
      });
      assertInStock(ctx, van, lines);
      const total = lines.reduce((s, l) => s + l.lineTotal.amount, 0);
      if (input.paidNow > total) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Paid more than the total', {
          fieldErrors: { paidNow: 'validation.paidTooMuch' },
        });
      }
      const settings = state.posSettings.find((s) => s.locationId === van);
      const taxRateBps = settings?.taxRateBps ?? 0;
      const before = outstandingOf(state, shop);
      const credit = total - input.paidNow;
      const after = before + credit;
      const id = newId('win');
      const number = nextInventoryNumber(ctx, 'WIN');
      const at = nowIso();
      const record: WholesaleInvoiceRecord = {
        id,
        tenantId: ctx.me.tenant.id,
        number,
        shopId: shop.id,
        shopName: shop.name,
        shopPhone: shop.phones.find((p) => p.primary)?.number ?? null,
        routeId: shop.routeId,
        locationId: van as WholesaleInvoiceRecord['locationId'],
        lines,
        total: money(ctx, total),
        tax: money(ctx, includedTax(total, taxRateBps)),
        taxLabel: settings?.taxLabel ?? 'VAT',
        taxRateBps,
        paidNow: input.paidNow
          ? { method: input.method ?? 'CASH', amount: money(ctx, input.paidNow) }
          : null,
        credit: money(ctx, credit),
        dueDate: addDays(at, shop.paymentTermsDays),
        creditWarning: credit > 0 && shop.creditLimit.amount > 0 && after > shop.creditLimit.amount,
        balanceBefore: money(ctx, before),
        balanceAfter: money(ctx, after),
        shares: [],
        prints: [],
        ...(input.note ? { note: input.note } : {}),
        createdBy: ctx.me.user.displayName,
        at,
      };
      const reference = { kind: 'WHOLESALE_INVOICE' as const, id, number };
      for (const l of lines) {
        postMovement(ctx, {
          productId: l.productId,
          locationId: van,
          type: 'SALE',
          quantity: -l.quantity,
          reference,
          note: shop.name,
          at,
        });
      }
      db.update((d) => {
        d.wholesaleInvoices.push(record);
      });
      recordAudit(ctx, {
        action: 'wholesale.invoice.create',
        entity: 'wholesale-invoice',
        entityId: id,
        entityLabel: `${number} · ${shop.name} · ${total / 100} (${credit / 100} on credit)${record.creditWarning ? ' · over credit limit' : ''}`,
        before: { outstanding: before },
        after: { outstanding: after },
      });
      return HttpResponse.json(invoiceView(db.get(), record), { status: 201 });
    }),
  ),

  http.post(
    `${API}/wholesale/invoices/:id/share`,
    handle(async ({ request, params }) => {
      const ctx = wholesaleContext(request);
      const invoice = findInvoice(ctx, String(params.id));
      const { channel } = await parseBody(request, shareInvoiceSchema);
      const record = {
        ...invoice,
        shares: [...invoice.shares, { channel, at: nowIso(), by: ctx.me.user.displayName }],
      };
      db.update((d) => {
        d.wholesaleInvoices = d.wholesaleInvoices.map((i) => (i.id === invoice.id ? record : i));
      });
      recordAudit(ctx, {
        action: 'wholesale.invoice.share',
        entity: 'wholesale-invoice',
        entityId: invoice.id,
        entityLabel: `${invoice.number} · ${channel.toLowerCase()} · ${invoice.shopName}`,
        before: null,
        after: { channel },
      });
      return HttpResponse.json(invoiceView(db.get(), record));
    }),
  ),

  http.post(
    `${API}/wholesale/invoices/:id/print`,
    handle(({ request, params }) => {
      const ctx = wholesaleContext(request);
      const invoice = findInvoice(ctx, String(params.id));
      const record = {
        ...invoice,
        prints: [...invoice.prints, { at: nowIso(), by: ctx.me.user.displayName }],
      };
      db.update((d) => {
        d.wholesaleInvoices = d.wholesaleInvoices.map((i) => (i.id === invoice.id ? record : i));
      });
      recordAudit(ctx, {
        action: invoice.prints.length ? 'wholesale.invoice.reprint' : 'wholesale.invoice.print',
        entity: 'wholesale-invoice',
        entityId: invoice.id,
        entityLabel: `${invoice.number} · ${invoice.shopName}`,
        before: null,
        after: null,
      });
      return HttpResponse.json(invoiceView(db.get(), record));
    }),
  ),

  /** WHO-004 */
  http.get(
    `${API}/wholesale/collections`,
    handle(({ request }) => {
      const ctx = wholesaleContext(request);
      const url = new URL(request.url);
      const shopId = url.searchParams.get('shopId');
      const routeId = url.searchParams.get('routeId');
      const date = url.searchParams.get('date');
      const days = url.searchParams.get('days');
      const items = db
        .get()
        .wholesaleCollections.filter(
          (c) =>
            c.tenantId === ctx.me.tenant.id &&
            (!shopId || c.shopId === shopId) &&
            (!routeId || c.routeId === routeId) &&
            sameDay(c.at, date) &&
            within(c.at, days),
        )
        .map(({ tenantId: _t, ...c }) => c)
        .sort((a, b) => b.at.localeCompare(a.at));
      return HttpResponse.json(items);
    }),
  ),

  /** Money received from a shop, applied to its oldest open invoices. */
  http.post(
    `${API}/wholesale/collections`,
    handle(async ({ request }) => {
      const ctx = wholesaleContext(request);
      const input = await parseBody(request, wholesaleCollectionSchema);
      const shop = findShop(ctx, input.shopId);
      const state = db.get();
      const before = outstandingOf(state, shop);
      if (input.amount > before) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'More than the shop owes', {
          fieldErrors: { amount: 'validation.amountTooHigh' },
          outstanding: before,
        });
      }
      const record: WholesaleCollection & { tenantId: string } = {
        id: newId('col'),
        tenantId: ctx.me.tenant.id,
        number: nextInventoryNumber(ctx, 'COL'),
        shopId: shop.id,
        shopName: shop.name,
        routeId: shop.routeId,
        amount: money(ctx, input.amount),
        method: input.method,
        ...(input.reference ? { reference: input.reference } : {}),
        allocations: allocate(openItems(state, shop), input.amount, currencyOf(ctx)),
        balanceAfter: money(ctx, before - input.amount),
        ...(input.note ? { note: input.note } : {}),
        receivedBy: ctx.me.user.displayName,
        at: nowIso(),
      };
      db.update((d) => {
        d.wholesaleCollections.push(record);
      });
      recordAudit(ctx, {
        action: 'wholesale.collection.create',
        entity: 'wholesale-shop',
        entityId: shop.id,
        entityLabel: `${record.number} · ${shop.name} · ${input.amount / 100} ${input.method.toLowerCase()}`,
        before: { outstanding: before },
        after: { outstanding: before - input.amount },
      });
      const { tenantId: _t, ...pub } = record;
      return HttpResponse.json(pub, { status: 201 });
    }),
  ),

  /** WHO-005 */
  http.get(
    `${API}/wholesale/returns`,
    handle(({ request }) => {
      const ctx = wholesaleContext(request);
      const url = new URL(request.url);
      const shopId = url.searchParams.get('shopId');
      const routeId = url.searchParams.get('routeId');
      const days = url.searchParams.get('days');
      const items: WholesaleReturn[] = db
        .get()
        .wholesaleReturns.filter(
          (r) =>
            r.tenantId === ctx.me.tenant.id &&
            (!shopId || r.shopId === shopId) &&
            (!routeId || r.routeId === routeId) &&
            within(r.at, days),
        )
        .map(({ tenantId: _t, ...r }) => r)
        .sort((a, b) => b.at.localeCompare(a.at));
      return HttpResponse.json(items);
    }),
  ),

  http.get(
    `${API}/wholesale/returns/:id`,
    handle(({ request, params }) => {
      const ctx = wholesaleContext(request);
      const r = db
        .get()
        .wholesaleReturns.find((x) => x.id === params.id && x.tenantId === ctx.me.tenant.id);
      if (!r) throw new MockHttpError('NOT_FOUND', 404, 'Return not found');
      return HttpResponse.json(returnDetail(ctx, r));
    }),
  ),

  /**
   * §26: goods back from a shop, credited at the invoice price (or today's wholesale price).
   * Everything goes back into the van (RETURN); anything not resellable then leaves as WASTAGE.
   */
  http.post(
    `${API}/wholesale/returns`,
    handle(async ({ request }) => {
      const ctx = wholesaleContext(request);
      const input = await parseBody(request, wholesaleReturnSchema);
      const shop = findShop(ctx, input.shopId);
      const state = db.get();
      const invoice = input.invoiceId ? findInvoice(ctx, input.invoiceId) : null;
      if (invoice && invoice.shopId !== shop.id) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Invoice is for another shop', {
          fieldErrors: { invoiceId: 'validation.required' },
        });
      }
      const van = invoice ? invoice.locationId : vanFor(ctx, shop);
      requireLocationAccess(ctx, van);
      // Linked: no more back than was invoiced and not yet returned.
      if (invoice) {
        const wanted = new Map<string, number>();
        for (const l of input.lines) {
          wanted.set(l.productId, (wanted.get(l.productId) ?? 0) + l.quantity);
        }
        input.lines.forEach((l, i) => {
          const line = invoice.lines.find((x) => x.productId === l.productId);
          if (!line || (wanted.get(l.productId) ?? 0) > line.quantity - line.returnedQuantity) {
            throw new MockHttpError('VALIDATION_FAILED', 400, 'More than was invoiced', {
              fieldErrors: { [`lines.${i}.quantity`]: 'validation.invoiceReturnTooMany' },
            });
          }
        });
      }
      const lines = input.lines.map((l, i) => {
        const unit =
          invoice?.lines.find((x) => x.productId === l.productId)?.unitPrice.amount ??
          priceOf(ctx, l.productId);
        if (unit === undefined) {
          throw new MockHttpError('VALIDATION_FAILED', 400, 'No wholesale price for that item', {
            fieldErrors: { [`lines.${i}.productId`]: 'validation.itemRequired' },
          });
        }
        const p = state.products.find((x) => x.id === l.productId)!;
        return {
          productId: p.id,
          code: p.code,
          name: p.name,
          unit: p.stockUnit ?? ('pcs' as const),
          quantity: l.quantity,
          condition: l.condition,
          unitCredit: money(ctx, unit),
          lineCredit: money(ctx, unit * l.quantity),
        };
      });
      const verified = requireVerifiedAction(ctx, input.verification, 'wholesale.return');
      const credit = lines.reduce((s, l) => s + l.lineCredit.amount, 0);
      const before = outstandingOf(state, shop);
      const id = newId('wrn');
      const number = nextInventoryNumber(ctx, 'WRN');
      const record: WholesaleReturn & { tenantId: string } = {
        id,
        tenantId: ctx.me.tenant.id,
        number,
        shopId: shop.id,
        shopName: shop.name,
        routeId: shop.routeId,
        invoiceId: invoice?.id ?? null,
        invoiceNumber: invoice?.number ?? null,
        locationId: van as WholesaleReturn['locationId'],
        lines,
        credit: money(ctx, credit),
        allocations: allocate(openItems(state, shop), credit, currencyOf(ctx), invoice?.id),
        balanceAfter: money(ctx, before - credit),
        reason: verified.reason,
        approvedBy: verified.employee.fullName,
        recordedBy: ctx.me.user.displayName,
        at: nowIso(),
      };
      const reference = { kind: 'WHOLESALE_RETURN' as const, id, number };
      for (const l of lines) {
        postMovement(ctx, {
          productId: l.productId,
          locationId: van,
          type: 'RETURN',
          quantity: l.quantity,
          reference,
          note: `${shop.name} · ${l.condition.toLowerCase()}`,
        });
        if (l.condition !== 'GOOD') {
          postMovement(ctx, {
            productId: l.productId,
            locationId: van,
            type: 'WASTAGE',
            quantity: -l.quantity,
            reference,
            reason: { code: l.condition, label: conditionLabel[l.condition] },
            approvedBy: verified.employee.fullName,
          });
        }
      }
      db.update((d) => {
        d.wholesaleReturns.push(record);
        if (invoice) {
          const target = d.wholesaleInvoices.find((x) => x.id === invoice.id)!;
          for (const l of lines) {
            const line = target.lines.find((x) => x.productId === l.productId);
            if (line) line.returnedQuantity += l.quantity;
          }
        }
      });
      recordAudit(ctx, {
        action: 'wholesale.return.create',
        entity: 'wholesale-shop',
        entityId: shop.id,
        entityLabel: `${number} · ${shop.name} · ${lines.map((l) => `${l.name} ×${l.quantity} ${l.condition.toLowerCase()}`).join(', ')}`,
        before: { outstanding: before },
        after: { outstanding: before - credit },
        verified,
      });
      return HttpResponse.json(returnDetail(ctx, record), { status: 201 });
    }),
  ),
];

const conditionLabel = {
  GOOD: 'Good',
  DAMAGED: 'Damaged',
  EXPIRED: 'Expired',
  WASTAGE: 'Wastage',
} as const;

function returnDetail(
  ctx: MockContext,
  r: WholesaleReturn & { tenantId: string },
): WholesaleReturnDetail {
  const { tenantId: _t, ...rest } = r;
  const movements: StockMovement[] = db
    .get()
    .stockMovements.filter(
      (m) =>
        m.tenantId === ctx.me.tenant.id &&
        m.reference.kind === 'WHOLESALE_RETURN' &&
        m.reference.id === r.id,
    )
    .map(({ tenantId: _x, ...m }) => m);
  return { ...rest, movements };
}
