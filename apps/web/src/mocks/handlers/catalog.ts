import type {
  Category,
  CategoryTreeNode,
  Location,
  LocationProduct,
  Money,
  NameTranslations,
  PriceMatrix,
  PriceMatrixRow,
  Product,
  QuickPadLayout,
} from '@rbp/types';
import {
  categoryInputSchema,
  categoryUpdateSchema,
  locationProductUpdateSchema,
  productInputSchema,
  productUpdateSchema,
  quickPadLayoutSchema,
  updatePricesSchema,
} from '@rbp/validation';
import { newId, nowIso } from '@rbp/utils';
import { http, HttpResponse } from 'msw';
import { recordAudit, requireVerifiedAction, type VerifiedAction } from '../audit';
import { type MockContext, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import type { MockLocationProductRecord } from '../db/catalog-seed';
import { locationStock, onHandIndex } from '../inventory';
import { stockForSale } from '../recipes';
import { API, handle, MockHttpError, paginate, parseBody } from '../http';

/** CAT-001…007 and the POS Quick Pad feed. Everything is scoped to the token's tenant. */

const matches = (search: string | null, ...fields: string[]) => {
  const q = search?.trim().toLowerCase();
  return !q || fields.some((f) => f.toLowerCase().includes(q));
};

const boolParam = (url: URL, key: string): boolean | undefined => {
  const v = url.searchParams.get(key);
  return v === 'true' ? true : v === 'false' ? false : undefined;
};

/** Drop blank translations so the English name is used instead. */
const cleanTranslations = (t: NameTranslations | undefined): NameTranslations =>
  Object.fromEntries(Object.entries(t ?? {}).filter(([, v]) => v?.trim())) as NameTranslations;

const fieldError = (field: string, key: string, message = 'Invalid value') =>
  new MockHttpError('VALIDATION_FAILED', 400, message, { fieldErrors: { [field]: key } });

const tenantCategories = (ctx: MockContext) =>
  db.get().categories.filter((c) => c.tenantId === ctx.me.tenant.id);

/** Sellable products; REC-001 kitchen ingredients live on their own screens. */
const tenantProducts = (ctx: MockContext) =>
  db.get().products.filter((p) => p.tenantId === ctx.me.tenant.id && p.kind !== 'INGREDIENT');

const bySortOrder = (a: Category, b: Category) =>
  a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);

/** Depth-first tree with depth, ancestor path and direct counts. */
function buildTree(categories: Category[], products: Product[]): CategoryTreeNode[] {
  const children = new Map<string | null, Category[]>();
  for (const c of categories) {
    const key = c.parentId && categories.some((p) => p.id === c.parentId) ? c.parentId : null;
    children.set(key, [...(children.get(key) ?? []), c]);
  }
  const out: CategoryTreeNode[] = [];
  const walk = (parentId: string | null, depth: number, path: string[]) => {
    for (const c of (children.get(parentId) ?? []).sort(bySortOrder)) {
      out.push({
        ...c,
        depth,
        path,
        childCount: children.get(c.id)?.length ?? 0,
        productCount: products.filter((p) => p.categoryId === c.id).length,
      });
      walk(c.id, depth + 1, [...path, c.name]);
    }
  };
  walk(null, 0, []);
  return out;
}

/** The category and every descendant id. */
function subtreeIds(categories: Category[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const c of categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        grew = true;
      }
    }
  }
  return ids;
}

function findCategory(ctx: MockContext, id: string): Category {
  const category = tenantCategories(ctx).find((c) => c.id === id);
  if (!category) throw new MockHttpError('NOT_FOUND', 404, 'Category not found');
  return category;
}

function findProduct(ctx: MockContext, id: string): Product {
  // Another tenant's product is indistinguishable from a missing one.
  const product = tenantProducts(ctx).find((p) => p.id === id);
  if (!product) throw new MockHttpError('NOT_FOUND', 404, 'Product not found');
  return product;
}

function assertCategory(ctx: MockContext, categoryId: string, field = 'categoryId') {
  if (!tenantCategories(ctx).some((c) => c.id === categoryId)) {
    throw fieldError(field, 'validation.categoryRequired', 'Unknown category');
  }
}

function assertUniqueCode(
  list: { tenantId: string; code: string; id: string }[],
  ctx: MockContext,
  code: string,
  exceptId?: string,
) {
  const taken = list.some(
    (x) =>
      x.tenantId === ctx.me.tenant.id &&
      x.id !== exceptId &&
      x.code.toLowerCase() === code.toLowerCase(),
  );
  if (taken) {
    throw new MockHttpError('CONFLICT', 409, `Code ${code} is already in use`, {
      field: 'code',
      fieldErrors: { code: 'validation.codeTaken' },
    });
  }
}

/**
 * Barcodes are unique tenant-wide (any product kind) so a POS scan resolves to exactly one
 * product. Returned as a field error on `barcodes` so CAT-004 shows it under the barcode list.
 */
function assertUniqueBarcodes(ctx: MockContext, barcodes: string[], exceptId?: string) {
  for (const code of barcodes) {
    const owner = db
      .get()
      .products.find(
        (p) => p.tenantId === ctx.me.tenant.id && p.id !== exceptId && p.barcodes.includes(code),
      );
    if (owner) {
      throw fieldError(
        'barcodes',
        'validation.barcodeTaken',
        `Barcode ${code} is already used by ${owner.code} ${owner.name}`,
      );
    }
  }
}

/** `?locationId=` (back office, must be allowed) or the X-Location-Id location. */
function targetLocation(ctx: MockContext, url: URL): Location {
  const requested = url.searchParams.get('locationId');
  if (requested) {
    const location = ctx.me.locations.find((l) => l.id === requested);
    if (!location) {
      throw new MockHttpError('LOCATION_NOT_ALLOWED', 403, 'Location not allowed', {
        locationId: requested,
      });
    }
    return location;
  }
  if (!ctx.me.currentLocation) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Select a location first', {
      header: 'X-Location-Id',
    });
  }
  return ctx.me.currentLocation;
}

function assertStation(ctx: MockContext, locationId: string, stationId: string | null) {
  if (stationId === null) return null;
  const exists = db
    .get()
    .kitchenStations.some(
      (s) => s.id === stationId && s.tenantId === ctx.me.tenant.id && s.locationId === locationId,
    );
  if (!exists) throw fieldError('stationId', 'validation.stationRequired', 'Unknown station');
  return stationId;
}

/** Selling at a location: catalog viewers and POS staff. */
function requireCatalogReadOrSell(ctx: MockContext) {
  if (!ctx.permissions.has('catalog.view') && !ctx.permissions.has('pos.sale.create')) {
    requirePermission(ctx, 'pos.sale.create');
  }
}

function rowFor(ctx: MockContext, locationId: string, productId: string) {
  return db
    .get()
    .locationProducts.find(
      (r) =>
        r.tenantId === ctx.me.tenant.id && r.locationId === locationId && r.productId === productId,
    );
}

function toLocationProduct(
  p: Product,
  locationId: Location['id'],
  row: MockLocationProductRecord | undefined,
  index?: ReturnType<typeof onHandIndex>,
): LocationProduct {
  const state = db.get();
  return {
    productId: p.id,
    locationId,
    categoryId: p.categoryId,
    code: p.code,
    name: p.name,
    nameTranslations: p.nameTranslations,
    imageUrl: p.imageUrl,
    barcodes: p.barcodes,
    taxMode: p.taxMode,
    price: row?.priceOverride ?? p.basePrice,
    priceOverride: row?.priceOverride ?? null,
    isAvailable: row?.isAvailable ?? true,
    ...(row?.stockNote ? { stockNote: row.stockNote } : {}),
    quickPadOrder: row?.quickPadOrder ?? Number.MAX_SAFE_INTEGER,
    showOnQuickPad: p.showOnQuickPad,
    enabled: row?.enabled ?? false,
    stationId: row?.stationId ?? null,
    serviceCharge: row?.serviceCharge ?? false,
    // INV: everything sold is tracked (when the tenant has inventory).
    // REC: a dish with a recipe reports how many can be made instead.
    stock: state.features[p.tenantId]?.includes('INVENTORY')
      ? stockForSale(
          state,
          p.tenantId,
          p.id,
          locationId,
          () => locationStock(state, p.tenantId, p.id, locationId, index),
          index,
        )
      : null,
  };
}

/** Upsert a location row; switching a product off keeps the row (and its price) — never deleted. */
function upsertRow(
  ctx: MockContext,
  locationId: Location['id'],
  productId: Product['id'],
  patch: Partial<MockLocationProductRecord>,
): MockLocationProductRecord {
  let result!: MockLocationProductRecord;
  db.update((d) => {
    let row = d.locationProducts.find(
      (r) =>
        r.tenantId === ctx.me.tenant.id && r.locationId === locationId && r.productId === productId,
    );
    if (!row) {
      const count = d.locationProducts.filter(
        (r) => r.tenantId === ctx.me.tenant.id && r.locationId === locationId,
      ).length;
      row = {
        tenantId: ctx.me.tenant.id,
        locationId,
        productId,
        enabled: false,
        isAvailable: true,
        priceOverride: null,
        quickPadOrder: count + 1,
        stationId: null,
        serviceCharge: false,
      };
      d.locationProducts.push(row);
    }
    Object.assign(row, patch);
    if (row.stockNote === null || row.stockNote === '') delete row.stockNote;
    result = { ...row };
  });
  return result;
}

/** Saved layout merged with the live catalog: new items appear at the end, removed ones drop out. */
/** `?deviceId=` must be one of the tenant's devices at that location. */
function targetDevice(ctx: MockContext, url: URL, location: Location): string | null {
  const deviceId = url.searchParams.get('deviceId');
  if (!deviceId) return null;
  const device = db
    .get()
    .devices.find(
      (d) => d.id === deviceId && d.tenantId === ctx.me.tenant.id && d.locationId === location.id,
    );
  if (!device) throw new MockHttpError('NOT_FOUND', 404, 'Device not found at this location');
  return device.id;
}

function savedLayout(ctx: MockContext, locationId: string, deviceId: string | null) {
  return db
    .get()
    .quickPadLayouts.find(
      (l) =>
        l.tenantId === ctx.me.tenant.id && l.locationId === locationId && l.deviceId === deviceId,
    );
}

/** Resolve Device → Location → default (INS-297…321), merged with the live catalog. */
function layoutFor(
  ctx: MockContext,
  location: Location,
  deviceId: string | null = null,
): QuickPadLayout {
  const state = db.get();
  const categories: string[] = buildTree(
    tenantCategories(ctx).filter((c) => c.isActive),
    [],
  ).map((c) => c.id);
  const products = new Map(tenantProducts(ctx).map((p) => [p.id, p]));
  const rows = state.locationProducts
    .filter(
      (r) =>
        r.tenantId === ctx.me.tenant.id &&
        r.locationId === location.id &&
        r.enabled &&
        products.get(r.productId)?.isActive &&
        products.get(r.productId)?.showOnQuickPad !== false,
    )
    .sort((a, b) => a.quickPadOrder - b.quickPadOrder);

  const deviceLayout = deviceId ? savedLayout(ctx, location.id, deviceId) : undefined;
  const saved = deviceLayout ?? savedLayout(ctx, location.id, null);
  const source: QuickPadLayout['source'] = deviceLayout ? 'device' : saved ? 'location' : 'default';
  const mergeOrder = (savedOrder: string[] | undefined, live: string[]) => {
    const liveSet = new Set(live);
    const kept = (savedOrder ?? []).filter((id) => liveSet.has(id));
    const keptSet = new Set(kept);
    return [...kept, ...live.filter((id) => !keptSet.has(id))];
  };

  const productOrder: QuickPadLayout['productOrder'] = {};
  for (const categoryId of categories) {
    const live = rows
      .filter((r) => products.get(r.productId)?.categoryId === categoryId)
      .map((r) => r.productId);
    if (live.length) productOrder[categoryId] = mergeOrder(saved?.productOrder[categoryId], live);
  }
  return {
    locationId: location.id,
    deviceId,
    source,
    categoryOrder: mergeOrder(saved?.categoryOrder, categories),
    categoryColors: Object.fromEntries(
      Object.entries(saved?.categoryColors ?? {}).filter(([id]) => categories.includes(id)),
    ),
    productOrder,
    updatedAt: saved?.updatedAt ?? null,
  };
}

export const catalogHandlers = [
  http.get(
    `${API}/categories`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requireCatalogReadOrSell(ctx);
      const url = new URL(request.url);
      const active = boolParam(url, 'active');
      const search = url.searchParams.get('search');
      const all = tenantCategories(ctx);

      if (boolParam(url, 'tree')) {
        // Inactive categories hide their whole subtree when filtering to active.
        const inactive = all.filter((c) => !c.isActive);
        const hidden = new Set(inactive.flatMap((c) => [...subtreeIds(all, c.id)]));
        const visible = active === true ? all.filter((c) => !hidden.has(c.id)) : all;
        return HttpResponse.json(buildTree(visible, tenantProducts(ctx)));
      }

      const parentId = url.searchParams.get('parentId');
      const items = all
        .filter(
          (c) =>
            (active === undefined || c.isActive === active) &&
            (!parentId || c.parentId === (parentId === 'root' ? null : parentId)) &&
            matches(search, c.name, c.code),
        )
        .sort(bySortOrder);
      return HttpResponse.json(paginate(items, url));
    }),
  ),

  http.post(
    `${API}/categories`,
    handle(async ({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.manage');
      const input = await parseBody(request, categoryInputSchema);
      assertUniqueCode(db.get().categories, ctx, input.code);
      const parentId = input.parentId ?? null;
      if (parentId) assertCategory(ctx, parentId, 'parentId');
      const now = nowIso();
      const siblings = tenantCategories(ctx).filter((c) => c.parentId === parentId);
      const category: Category = {
        id: newId('cat') as Category['id'],
        tenantId: ctx.me.tenant.id,
        parentId: parentId as Category['parentId'],
        code: input.code,
        name: input.name,
        nameTranslations: cleanTranslations(input.nameTranslations),
        imageUrl: input.imageUrl ?? null,
        color: input.color,
        sortOrder: input.sortOrder ?? siblings.length + 1,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      };
      db.update((d) => {
        d.categories.push(category);
      });
      recordAudit(ctx, {
        action: 'catalog.category.create',
        entity: 'category',
        entityId: category.id,
        entityLabel: category.name,
        before: null,
        after: category,
      });
      return HttpResponse.json(category, { status: 201 });
    }),
  ),

  http.patch(
    `${API}/categories/:id`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.manage');
      const existing = findCategory(ctx, String(params.id));
      const input = await parseBody(request, categoryUpdateSchema);
      const all = tenantCategories(ctx);

      if (input.code) assertUniqueCode(db.get().categories, ctx, input.code, existing.id);
      if (input.parentId) {
        assertCategory(ctx, input.parentId, 'parentId');
        if (subtreeIds(all, existing.id).has(input.parentId)) {
          throw fieldError(
            'parentId',
            'validation.categoryCycle',
            'Category cannot be its own ancestor',
          );
        }
      }
      if (input.isActive === false && existing.isActive) {
        const children = all.filter((c) => c.parentId === existing.id && c.isActive).length;
        const products = tenantProducts(ctx).filter(
          (p) => p.categoryId === existing.id && p.isActive,
        ).length;
        if (children || products) {
          throw new MockHttpError(
            'CONFLICT',
            409,
            'Move or deactivate its subcategories and products first',
            { children, products },
          );
        }
      }

      const updated: Category = {
        ...existing,
        ...input,
        ...(input.nameTranslations
          ? { nameTranslations: cleanTranslations(input.nameTranslations) }
          : {}),
        parentId: (input.parentId === undefined
          ? existing.parentId
          : input.parentId) as Category['parentId'],
        updatedAt: nowIso(),
      };
      db.update((d) => {
        d.categories = d.categories.map((c) => (c.id === existing.id ? updated : c));
      });
      recordAudit(ctx, {
        action: 'catalog.category.update',
        entity: 'category',
        entityId: existing.id,
        entityLabel: updated.name,
        before: existing,
        after: updated,
      });
      return HttpResponse.json(updated);
    }),
  ),

  http.get(
    `${API}/products`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.view');
      const url = new URL(request.url);
      const active = boolParam(url, 'active');
      const search = url.searchParams.get('search');
      const categoryId = url.searchParams.get('categoryId');
      const inCategory = categoryId ? subtreeIds(tenantCategories(ctx), categoryId) : null;
      const items = tenantProducts(ctx)
        .filter(
          (p) =>
            (!inCategory || inCategory.has(p.categoryId)) &&
            (active === undefined || p.isActive === active) &&
            matches(search, p.name, p.code, ...p.barcodes),
        )
        .sort((a, b) => a.code.localeCompare(b.code));
      return HttpResponse.json(paginate(items, url));
    }),
  ),

  http.get(
    `${API}/products/:id`,
    handle(({ request, params }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.view');
      return HttpResponse.json(findProduct(ctx, String(params.id)));
    }),
  ),

  http.post(
    `${API}/products`,
    handle(async ({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.manage');
      const input = await parseBody(request, productInputSchema);
      assertCategory(ctx, input.categoryId);
      assertUniqueCode(db.get().products, ctx, input.code);
      assertUniqueBarcodes(ctx, input.barcodes ?? []);
      const now = nowIso();
      const product: Product = {
        id: newId('prd') as Product['id'],
        tenantId: ctx.me.tenant.id,
        categoryId: input.categoryId as Product['categoryId'],
        code: input.code,
        name: input.name,
        nameTranslations: cleanTranslations(input.nameTranslations),
        imageUrl: input.imageUrl ?? null,
        ...(input.description ? { description: input.description } : {}),
        basePrice: input.basePrice,
        taxMode: input.taxMode,
        barcodes: input.barcodes ?? [],
        isActive: true,
        showOnQuickPad: input.showOnQuickPad ?? true,
        createdAt: now,
        updatedAt: now,
      };
      db.update((d) => {
        d.products.push(product);
      });
      recordAudit(ctx, {
        action: 'catalog.product.create',
        entity: 'product',
        entityId: product.id,
        entityLabel: product.name,
        before: null,
        after: product,
      });
      return HttpResponse.json(product, { status: 201 });
    }),
  ),

  http.patch(
    `${API}/products/:id`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.manage');
      const existing = findProduct(ctx, String(params.id));
      const input = await parseBody(request, productUpdateSchema);
      if (input.categoryId) assertCategory(ctx, input.categoryId);
      if (input.code) assertUniqueCode(db.get().products, ctx, input.code, existing.id);
      if (input.barcodes) assertUniqueBarcodes(ctx, input.barcodes, existing.id);
      const updated: Product = {
        ...existing,
        ...input,
        ...(input.nameTranslations
          ? { nameTranslations: cleanTranslations(input.nameTranslations) }
          : {}),
        categoryId: (input.categoryId ?? existing.categoryId) as Product['categoryId'],
        updatedAt: nowIso(),
      };
      db.update((d) => {
        d.products = d.products.map((p) => (p.id === existing.id ? updated : p));
      });
      recordAudit(ctx, {
        action: 'catalog.product.update',
        entity: 'product',
        entityId: existing.id,
        entityLabel: updated.name,
        before: existing,
        after: updated,
      });
      return HttpResponse.json(updated);
    }),
  ),

  /** POS-001 Quick Pad feed, and CAT-005 (`all=true`) for the back office. */
  http.get(
    `${API}/location-products`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requireCatalogReadOrSell(ctx);
      const url = new URL(request.url);
      const location = targetLocation(ctx, url);
      const all = boolParam(url, 'all') === true;
      if (all) requirePermission(ctx, 'catalog.manage');

      const rows = new Map(
        db
          .get()
          .locationProducts.filter(
            (r) => r.tenantId === ctx.me.tenant.id && r.locationId === location.id,
          )
          .map((r) => [r.productId, r]),
      );
      const index = onHandIndex(db.get(), ctx.me.tenant.id);
      const items = tenantProducts(ctx)
        .filter((p) => p.isActive && (all || rows.get(p.id)?.enabled))
        .map((p) => toLocationProduct(p, location.id, rows.get(p.id), index))
        .sort((a, b) => (all ? a.code.localeCompare(b.code) : a.quickPadOrder - b.quickPadOrder));
      return HttpResponse.json(items);
    }),
  ),

  http.put(
    `${API}/location-products/:productId`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.manage');
      const location = targetLocation(ctx, new URL(request.url));
      const product = findProduct(ctx, String(params.productId));
      const input = await parseBody(request, locationProductUpdateSchema);
      const before = rowFor(ctx, location.id, product.id);
      const row = upsertRow(ctx, location.id, product.id, {
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
        ...(input.stockNote !== undefined ? { stockNote: input.stockNote ?? undefined } : {}),
        ...(input.serviceCharge !== undefined ? { serviceCharge: input.serviceCharge } : {}),
        ...(input.stationId !== undefined
          ? { stationId: assertStation(ctx, location.id, input.stationId) }
          : {}),
      });
      recordAudit(ctx, {
        action: 'catalog.location-product.update',
        entity: 'location-product',
        entityId: `${location.id}:${product.id}`,
        entityLabel: `${product.name} @ ${location.name}`,
        before: before ?? null,
        after: row,
      });
      return HttpResponse.json(toLocationProduct(product, location.id, row));
    }),
  ),

  /** CAT-006 price grid: base price plus one override column per allowed location. */
  http.get(
    `${API}/price-matrix`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.manage');
      const url = new URL(request.url);
      const search = url.searchParams.get('search');
      const categoryId = url.searchParams.get('categoryId');
      const inCategory = categoryId ? subtreeIds(tenantCategories(ctx), categoryId) : null;
      const locations = ctx.me.locations;
      const rows = db.get().locationProducts.filter((r) => r.tenantId === ctx.me.tenant.id);

      const items: PriceMatrixRow[] = tenantProducts(ctx)
        .filter(
          (p) =>
            p.isActive &&
            (!inCategory || inCategory.has(p.categoryId)) &&
            matches(search, p.name, p.code, ...p.barcodes),
        )
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((p) => {
          const byLocation = new Map(
            rows.filter((r) => r.productId === p.id).map((r) => [r.locationId as string, r]),
          );
          return {
            productId: p.id,
            code: p.code,
            name: p.name,
            categoryId: p.categoryId,
            basePrice: p.basePrice,
            prices: Object.fromEntries(
              locations.map((l) => [l.id, byLocation.get(l.id)?.priceOverride ?? null]),
            ),
            enabled: Object.fromEntries(
              locations.map((l) => [l.id, byLocation.get(l.id)?.enabled ?? false]),
            ),
          };
        });
      const body: PriceMatrix = {
        ...paginate(items, url),
        locations: locations.map(({ id, code, name }) => ({ id, code, name })),
      };
      return HttpResponse.json(body);
    }),
  ),

  http.put(
    `${API}/price-matrix`,
    handle(async ({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.manage');
      const input = await parseBody(request, updatePricesSchema);
      const currency = ctx.me.tenant.currency;

      // Resolve every change first so nothing is applied if one is invalid.
      const resolved = input.changes.map((change, i) => {
        const product = findProduct(ctx, change.productId);
        if (change.price && change.price.currency !== currency) {
          throw fieldError(`changes.${i}.price`, 'validation.priceRequired', 'Wrong currency');
        }
        if (change.locationId === null) {
          const before = product.basePrice;
          const after = change.price as Money;
          return { product, location: null, before, after, lowers: after.amount < before.amount };
        }
        const location = ctx.me.locations.find((l) => l.id === change.locationId);
        if (!location) {
          throw new MockHttpError('LOCATION_NOT_ALLOWED', 403, 'Location not allowed', {
            locationId: change.locationId,
          });
        }
        const before = rowFor(ctx, location.id, product.id)?.priceOverride ?? null;
        const effectiveBefore = before ?? product.basePrice;
        const effectiveAfter = change.price ?? product.basePrice;
        return {
          product,
          location,
          before,
          after: change.price,
          lowers: effectiveAfter.amount < effectiveBefore.amount,
        };
      });

      // REQ-224: lowering a selling price is a price override — PIN + permission + reason.
      let verified: VerifiedAction | undefined;
      if (resolved.some((r) => r.lowers)) {
        verified = requireVerifiedAction(ctx, input.verification, 'pos.price.override');
      }

      for (const r of resolved) {
        if (r.location === null) {
          db.update((d) => {
            const p = d.products.find((x) => x.id === r.product.id)!;
            p.basePrice = r.after as Money;
            p.updatedAt = nowIso();
          });
        } else {
          upsertRow(ctx, r.location.id, r.product.id, { priceOverride: r.after });
        }
        recordAudit(ctx, {
          action: 'catalog.price.change',
          entity: 'product',
          entityId: r.product.id,
          entityLabel: `${r.product.name} · ${r.location?.name ?? 'Base price'}`,
          before: r.before,
          after: r.after,
          ...(verified ? { verified } : {}),
        });
      }
      return HttpResponse.json({ updated: resolved.length });
    }),
  ),

  /** CAT-007 layout, also read by the POS for category order and colours. */
  http.get(
    `${API}/quick-pad-layout`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requireCatalogReadOrSell(ctx);
      const url = new URL(request.url);
      const location = targetLocation(ctx, url);
      return HttpResponse.json(layoutFor(ctx, location, targetDevice(ctx, url, location)));
    }),
  ),

  http.put(
    `${API}/quick-pad-layout`,
    handle(async ({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.manage');
      const url = new URL(request.url);
      const location = targetLocation(ctx, url);
      const deviceId = targetDevice(ctx, url, location);
      const input = await parseBody(request, quickPadLayoutSchema);
      const categoryIds = new Set(tenantCategories(ctx).map((c) => c.id as string));
      const productIds = new Set(tenantProducts(ctx).map((p) => p.id as string));
      const unknown =
        input.categoryOrder.some((id) => !categoryIds.has(id)) ||
        Object.keys(input.productOrder).some((id) => !categoryIds.has(id)) ||
        Object.values(input.productOrder)
          .flat()
          .some((id) => !productIds.has(id));
      if (unknown) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Layout references unknown items');
      }

      const before = layoutFor(ctx, location, deviceId);
      const updatedAt = nowIso();
      db.update((d) => {
        d.quickPadLayouts = d.quickPadLayouts.filter(
          (l) =>
            !(
              l.tenantId === ctx.me.tenant.id &&
              l.locationId === location.id &&
              l.deviceId === deviceId
            ),
        );
        d.quickPadLayouts.push({
          tenantId: ctx.me.tenant.id,
          locationId: location.id,
          deviceId,
          categoryOrder: input.categoryOrder,
          categoryColors: input.categoryColors,
          productOrder: input.productOrder,
          updatedAt,
        });
        // The location's product order also drives the POS feed ordering.
        if (deviceId) return;
        for (const ids of Object.values(input.productOrder)) {
          ids.forEach((productId, index) => {
            const row = d.locationProducts.find(
              (r) =>
                r.tenantId === ctx.me.tenant.id &&
                r.locationId === location.id &&
                r.productId === productId,
            );
            if (row) row.quickPadOrder = index + 1;
          });
        }
      });
      const after = layoutFor(ctx, location, deviceId);
      recordAudit(ctx, {
        action: 'catalog.quick-pad.update',
        entity: 'quick-pad-layout',
        entityId: deviceId ?? location.id,
        entityLabel: deviceId ? `${location.name} · ${deviceName(deviceId)}` : location.name,
        before,
        after,
      });
      return HttpResponse.json(after);
    }),
  ),

  /** Remove a device's own layout; it follows the location layout again. */
  http.delete(
    `${API}/quick-pad-layout`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'catalog.manage');
      const url = new URL(request.url);
      const location = targetLocation(ctx, url);
      const deviceId = targetDevice(ctx, url, location);
      if (!deviceId) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Only device layouts can be reset');
      }
      const before = layoutFor(ctx, location, deviceId);
      db.update((d) => {
        d.quickPadLayouts = d.quickPadLayouts.filter(
          (l) =>
            !(
              l.tenantId === ctx.me.tenant.id &&
              l.locationId === location.id &&
              l.deviceId === deviceId
            ),
        );
      });
      const after = layoutFor(ctx, location, deviceId);
      recordAudit(ctx, {
        action: 'catalog.quick-pad.reset-device',
        entity: 'quick-pad-layout',
        entityId: deviceId,
        entityLabel: `${location.name} · ${deviceName(deviceId)}`,
        before,
        after,
      });
      return HttpResponse.json(after);
    }),
  ),

  /** Stations (and their simulated printers) that KOTs route to at a location. */
  http.get(
    `${API}/kitchen-stations`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      // Kitchen displays filter by station too.
      if (!ctx.permissions.has('kot.view')) requireCatalogReadOrSell(ctx);
      const location = targetLocation(ctx, new URL(request.url));
      return HttpResponse.json(
        db
          .get()
          .kitchenStations.filter(
            (s) => s.tenantId === ctx.me.tenant.id && s.locationId === location.id,
          )
          .map(({ tenantId: _tenantId, ...station }) => station),
      );
    }),
  ),
];

const deviceName = (id: string) => db.get().devices.find((d) => d.id === id)?.name ?? id;
