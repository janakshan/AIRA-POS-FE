import type {
  Ingredient,
  PreparedItem,
  Product,
  Recipe,
  RecipeListResponse,
  RecipePlanning,
} from '@rbp/types';
import {
  disposePreparedSchema,
  ingredientSchema,
  preparedItemSchema,
  recipeSchema,
} from '@rbp/validation';
import { newId, nowIso } from '@rbp/utils';
import { http, HttpResponse } from 'msw';
import { recordAudit } from '../audit';
import { type MockContext, requireFeature, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import type { PreparedRecord, RecipeRecord } from '../db/seed';
import { API, handle, MockHttpError, parseBody } from '../http';
import {
  activeRecipe,
  assertInStock,
  minStockOf,
  onHandIndex,
  postMovement,
  settingKey,
  statusOf,
} from '../inventory';
import { locationName, myLocationIds, requireLocationAccess, targetLocation } from '../location';
import { formulasOf } from '../production';
import {
  availabilityOf,
  consumeIngredients,
  createPrepared,
  DEFAULT_SHELF_LIFE_HOURS,
  preparedStatus,
  requireDish,
} from '../recipes';

/**
 * REC-001…005 (prototype). Ingredients are stock-only products on the same ledger; a recipe
 * makes a dish "made to order"; the prepared queue holds cooked food waiting to be resold.
 */

function recipesContext(request: Request) {
  const ctx = resolveContext(request);
  requireFeature(ctx, 'RECIPES');
  requirePermission(ctx, 'production.manage');
  return ctx;
}

/** REC-005 is run by the kitchen too. */
function preparedContext(request: Request) {
  const ctx = resolveContext(request);
  requireFeature(ctx, 'RECIPES');
  if (!ctx.permissions.has('production.manage')) requirePermission(ctx, 'kot.manage');
  return ctx;
}

const ingredientsOf = (ctx: MockContext) =>
  db.get().products.filter((p) => p.tenantId === ctx.me.tenant.id && p.kind === 'INGREDIENT');

/** Two ingredients called "Chicken" can't be told apart on a recipe or a PO (QA REC-001). */
function requireUniqueIngredientName(ctx: MockContext, name: string, exceptId?: string) {
  const key = name.trim().toLowerCase();
  if (ingredientsOf(ctx).some((p) => p.id !== exceptId && p.name.trim().toLowerCase() === key)) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Ingredient exists', {
      fieldErrors: { name: 'validation.ingredientTaken' },
    });
  }
}

function findIngredient(ctx: MockContext, id: string) {
  const p = ingredientsOf(ctx).find((x) => x.id === id);
  if (!p) throw new MockHttpError('NOT_FOUND', 404, 'Ingredient not found');
  return p;
}

function ingredientOf(
  ctx: MockContext,
  p: Product,
  locationIds: string[],
  index = onHandIndex(db.get(), ctx.me.tenant.id),
): Ingredient {
  const state = db.get();
  // Made-to-order recipes and bakery production formulas (BAK) both draw on ingredients.
  const productIds = new Set([
    ...state.recipes
      .filter((r) => r.tenantId === ctx.me.tenant.id && r.isActive)
      .filter((r) => r.lines.some((l) => l.ingredientId === p.id))
      .map((r) => r.productId as string),
    ...formulasOf(state, ctx.me.tenant.id)
      .filter((f) => f.lines.some((l) => l.ingredientId === p.id))
      .map((f) => f.productId),
  ]);
  const usedIn = [...productIds].map((productId) => ({
    productId,
    name: state.products.find((x) => x.id === productId)?.name ?? productId,
  }));
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.stockUnit ?? 'pcs',
    ...(p.portion ? { portion: p.portion } : {}),
    isActive: p.isActive,
    usedIn,
    levels: locationIds.map((locationId) => {
      const onHand = index.qty.get(settingKey(p.id, locationId)) ?? 0;
      const minStock = minStockOf(state, p.id, locationId);
      return {
        locationId: locationId as Ingredient['levels'][number]['locationId'],
        onHand,
        minStock,
        status: statusOf(onHand, minStock),
      };
    }),
  };
}

function recipeOf(ctx: MockContext, r: RecipeRecord, locationId: string): Recipe {
  const state = db.get();
  const index = onHandIndex(state, ctx.me.tenant.id);
  const product = state.products.find((p) => p.id === r.productId);
  return {
    productId: r.productId,
    productCode: product?.code ?? '',
    productName: product?.name ?? r.productId,
    isActive: r.isActive,
    ...(r.note ? { note: r.note } : {}),
    lines: r.lines.map((l) => {
      const ing = state.products.find((p) => p.id === l.ingredientId);
      return {
        ...l,
        code: ing?.code ?? '',
        name: ing?.name ?? l.ingredientId,
        unit: ing?.stockUnit ?? 'pcs',
        onHand: index.qty.get(settingKey(l.ingredientId, locationId)) ?? 0,
      };
    }),
    availability: availabilityOf(state, ctx.me.tenant.id, r, locationId, index),
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy,
  };
}

const findRecipe = (ctx: MockContext, productId: string) =>
  db.get().recipes.find((r) => r.tenantId === ctx.me.tenant.id && r.productId === productId);

function preparedOf(p: PreparedRecord): PreparedItem {
  const { tenantId: _t, ...rest } = p;
  return { ...rest, status: preparedStatus(p) };
}

function findPrepared(ctx: MockContext, id: string) {
  const p = db.get().preparedItems.find((x) => x.id === id && x.tenantId === ctx.me.tenant.id);
  if (!p) throw new MockHttpError('NOT_FOUND', 404, 'Prepared item not found');
  requireLocationAccess(ctx, p.locationId);
  return p;
}

export const recipeHandlers = [
  /** REC-001 */
  http.get(
    `${API}/ingredients`,
    handle(({ request }) => {
      const ctx = recipesContext(request);
      const url = new URL(request.url);
      const param = url.searchParams.get('locationId');
      const locations = param === 'all' ? myLocationIds(ctx) : [targetLocation(ctx, url)];
      const q = url.searchParams.get('search')?.trim().toLowerCase();
      const index = onHandIndex(db.get(), ctx.me.tenant.id);
      const items = ingredientsOf(ctx)
        .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ingredientOf(ctx, p, locations, index));
      return HttpResponse.json(items);
    }),
  ),

  http.get(
    `${API}/ingredients/:id`,
    handle(({ request, params }) => {
      const ctx = recipesContext(request);
      const url = new URL(request.url);
      const p = findIngredient(ctx, String(params.id));
      return HttpResponse.json(ingredientOf(ctx, p, [targetLocation(ctx, url)]));
    }),
  ),

  http.post(
    `${API}/ingredients`,
    handle(async ({ request }) => {
      const ctx = recipesContext(request);
      const input = await parseBody(request, ingredientSchema);
      const locationId = input.locationId ?? ctx.me.currentLocation?.id ?? myLocationIds(ctx)[0]!;
      requireLocationAccess(ctx, locationId);
      const state = db.get();
      if (
        state.products.some(
          (p) =>
            p.tenantId === ctx.me.tenant.id && p.code.toLowerCase() === input.code.toLowerCase(),
        )
      ) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Code in use', {
          fieldErrors: { code: 'validation.codeTaken' },
        });
      }
      requireUniqueIngredientName(ctx, input.name);
      const now = nowIso();
      const product: Product = {
        id: newId('ing') as Product['id'],
        tenantId: ctx.me.tenant.id,
        categoryId: 'cat_01INGREDIENTS' as Product['categoryId'],
        code: input.code,
        name: input.name,
        nameTranslations: {},
        imageUrl: null,
        basePrice: { amount: 0, currency: ctx.me.tenant.currency },
        taxMode: 'INCLUSIVE',
        barcodes: [],
        isActive: true,
        showOnQuickPad: false,
        stockUnit: input.unit,
        kind: 'INGREDIENT',
        ...(input.portion ? { portion: input.portion } : {}),
        createdAt: now,
        updatedAt: now,
      };
      db.update((d) => {
        d.products.push(product);
        // Always write settings so the new ingredient is tracked here (orderable, adjustable).
        d.stockSettings[settingKey(product.id, locationId)] = { minStock: input.minStock ?? 0 };
      });
      recordAudit(ctx, {
        action: 'recipes.ingredient.create',
        entity: 'ingredient',
        entityId: product.id,
        entityLabel: `${product.code} ${product.name}`,
        before: null,
        after: product,
      });
      return HttpResponse.json(ingredientOf(ctx, product, [locationId]), { status: 201 });
    }),
  ),

  /** Name, unit, portion (REC-004) and the minimum at a location. */
  http.patch(
    `${API}/ingredients/:id`,
    handle(async ({ request, params }) => {
      const ctx = recipesContext(request);
      const existing = findIngredient(ctx, String(params.id));
      const input = await parseBody(request, ingredientSchema);
      const locationId = input.locationId ?? ctx.me.currentLocation?.id ?? myLocationIds(ctx)[0]!;
      requireLocationAccess(ctx, locationId);
      if (
        db
          .get()
          .products.some(
            (p) =>
              p.tenantId === ctx.me.tenant.id &&
              p.id !== existing.id &&
              p.code.toLowerCase() === input.code.toLowerCase(),
          )
      ) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Code in use', {
          fieldErrors: { code: 'validation.codeTaken' },
        });
      }
      requireUniqueIngredientName(ctx, input.name, existing.id);
      const { portion: _p, ...base } = existing;
      const updated: Product = {
        ...base,
        code: input.code,
        name: input.name,
        stockUnit: input.unit,
        // null clears the portion; omitted keeps it.
        ...(input.portion
          ? { portion: input.portion }
          : input.portion === undefined && existing.portion
            ? { portion: existing.portion }
            : {}),
        updatedAt: nowIso(),
      };
      db.update((d) => {
        d.products = d.products.map((p) => (p.id === existing.id ? updated : p));
        if (input.minStock !== undefined) {
          d.stockSettings[settingKey(existing.id, locationId)] = { minStock: input.minStock };
        }
      });
      recordAudit(ctx, {
        action: 'recipes.ingredient.update',
        entity: 'ingredient',
        entityId: existing.id,
        entityLabel: `${updated.code} ${updated.name}`,
        before: existing,
        after: updated,
      });
      return HttpResponse.json(ingredientOf(ctx, updated, [locationId]));
    }),
  ),

  /** REC-002: recipes with availability at a location, plus menu items without one. */
  http.get(
    `${API}/recipes`,
    handle(({ request }) => {
      const ctx = recipesContext(request);
      const locationId = targetLocation(ctx, new URL(request.url));
      const state = db.get();
      const recipes = state.recipes
        .filter((r) => r.tenantId === ctx.me.tenant.id)
        .map((r) => recipeOf(ctx, r, locationId))
        .sort(
          (a, b) =>
            Number(b.isActive) - Number(a.isActive) || a.productName.localeCompare(b.productName),
        );
      const withRecipe = new Set(recipes.map((r) => r.productId));
      const sold = new Set(
        state.locationProducts
          .filter(
            (r) => r.tenantId === ctx.me.tenant.id && r.locationId === locationId && r.enabled,
          )
          .map((r) => r.productId),
      );
      const withoutRecipe = state.products
        .filter(
          (p) =>
            p.tenantId === ctx.me.tenant.id &&
            p.kind !== 'INGREDIENT' &&
            p.isActive &&
            sold.has(p.id) &&
            !withRecipe.has(p.id),
        )
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((p) => ({ productId: p.id, code: p.code, name: p.name }));
      const body: RecipeListResponse = { recipes, withoutRecipe };
      return HttpResponse.json(body);
    }),
  ),

  http.get(
    `${API}/recipes/:productId`,
    handle(({ request, params }) => {
      const ctx = recipesContext(request);
      const locationId = targetLocation(ctx, new URL(request.url));
      const productId = String(params.productId);
      requireDish(ctx, productId);
      const r = findRecipe(ctx, productId);
      if (!r) throw new MockHttpError('NOT_FOUND', 404, 'No recipe yet');
      return HttpResponse.json(recipeOf(ctx, r, locationId));
    }),
  ),

  /** REC-003 create or replace a dish's recipe (one per dish). */
  http.put(
    `${API}/recipes/:productId`,
    handle(async ({ request, params }) => {
      const ctx = recipesContext(request);
      const locationId = targetLocation(ctx, new URL(request.url));
      const dish = requireDish(ctx, String(params.productId));
      const input = await parseBody(request, recipeSchema);
      const ingredientIds = new Set(ingredientsOf(ctx).map((p) => p.id as string));
      input.lines.forEach((l, i) => {
        if (!ingredientIds.has(l.ingredientId)) {
          throw new MockHttpError('VALIDATION_FAILED', 400, 'Unknown ingredient', {
            fieldErrors: { [`lines.${i}.ingredientId`]: 'validation.itemRequired' },
          });
        }
      });
      const before = findRecipe(ctx, dish.id);
      const record: RecipeRecord = {
        tenantId: ctx.me.tenant.id,
        productId: dish.id,
        lines: input.lines,
        isActive: input.isActive,
        ...(input.note ? { note: input.note } : {}),
        updatedAt: nowIso(),
        updatedBy: ctx.me.user.displayName,
      };
      db.update((d) => {
        d.recipes = [
          ...d.recipes.filter((r) => !(r.tenantId === record.tenantId && r.productId === dish.id)),
          record,
        ];
      });
      const names = new Map(ingredientsOf(ctx).map((p) => [p.id as string, p.name]));
      recordAudit(ctx, {
        action: before ? 'recipes.recipe.update' : 'recipes.recipe.create',
        entity: 'recipe',
        entityId: dish.id,
        entityLabel: `${dish.name}: ${record.lines.map((l) => `${names.get(l.ingredientId)} ${l.quantity}`).join(', ')}${record.isActive ? '' : ' (paused)'}`,
        before: before ?? null,
        after: record,
      });
      return HttpResponse.json(recipeOf(ctx, record, locationId), {
        status: before ? 200 : 201,
      });
    }),
  ),

  /** REC-004 "today's requirement" inputs. */
  http.get(
    `${API}/recipe-planning`,
    handle(({ request }) => {
      const ctx = recipesContext(request);
      const locationId = targetLocation(ctx, new URL(request.url));
      const state = db.get();
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const sold = new Map<string, number>();
      for (const o of state.orders) {
        if (
          o.tenantId === ctx.me.tenant.id &&
          o.locationId === locationId &&
          o.status === 'PAID' &&
          (o.paidAt ?? o.createdAt) >= since
        ) {
          for (const l of o.lines) sold.set(l.productId, (sold.get(l.productId) ?? 0) + l.quantity);
        }
      }
      const recipes = state.recipes.filter((r) => r.tenantId === ctx.me.tenant.id && r.isActive);
      const index = onHandIndex(state, ctx.me.tenant.id);
      const used = new Set(recipes.flatMap((r) => r.lines.map((l) => l.ingredientId)));
      const body: RecipePlanning = {
        locationId: locationId as RecipePlanning['locationId'],
        dishes: recipes.map((r) => {
          const p = state.products.find((x) => x.id === r.productId);
          return {
            productId: r.productId,
            code: p?.code ?? '',
            name: p?.name ?? r.productId,
            averageDaily: Math.ceil((sold.get(r.productId) ?? 0) / 30),
            lines: r.lines,
          };
        }),
        ingredients: ingredientsOf(ctx)
          .filter((p) => used.has(p.id))
          .map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            unit: p.stockUnit ?? 'pcs',
            onHand: index.qty.get(settingKey(p.id, locationId)) ?? 0,
            minStock: minStockOf(state, p.id, locationId),
            ...(p.portion ? { portion: p.portion } : {}),
          })),
      };
      return HttpResponse.json(body);
    }),
  ),

  /** REC-005 the queue at a location, newest first. */
  http.get(
    `${API}/prepared-items`,
    handle(({ request }) => {
      const ctx = preparedContext(request);
      const url = new URL(request.url);
      const locationId = targetLocation(ctx, url);
      const status = url.searchParams.get('status');
      const items = db
        .get()
        .preparedItems.filter((p) => p.tenantId === ctx.me.tenant.id && p.locationId === locationId)
        .map(preparedOf)
        .filter((p) => !status || p.status === status)
        .sort((a, b) => b.preparedAt.localeCompare(a.preparedAt));
      return HttpResponse.json(items);
    }),
  ),

  /** Made extra: a recipe dish uses its ingredients now. */
  http.post(
    `${API}/prepared-items`,
    handle(async ({ request }) => {
      const ctx = preparedContext(request);
      const locationId = targetLocation(ctx, new URL(request.url));
      const input = await parseBody(request, preparedItemSchema);
      const dish = requireDish(ctx, input.productId);
      const recipe = activeRecipe(db.get(), ctx.me.tenant.id, dish.id);
      if (recipe) {
        assertInStock(
          ctx,
          locationId,
          recipe.lines.map((l) => ({
            productId: l.ingredientId,
            quantity: l.quantity * input.quantity,
          })),
        );
        consumeIngredients(ctx, recipe, input.quantity, locationId, {
          type: 'PRODUCTION_CONSUMPTION',
          reference: { kind: 'ADJUSTMENT', id: null, number: 'Prepared queue' },
          note: `${dish.name} ×${input.quantity} made extra`,
        });
      }
      const record = createPrepared(ctx, {
        productId: dish.id,
        locationId,
        quantity: input.quantity,
        source: { kind: 'MANUAL' },
        shelfLifeHours: input.shelfLifeHours ?? DEFAULT_SHELF_LIFE_HOURS,
        ...(input.note ? { note: input.note } : {}),
      });
      recordAudit(ctx, {
        action: 'recipes.prepared.create',
        entity: 'prepared-item',
        entityId: record.id,
        entityLabel: `${dish.name} ×${input.quantity} ready at ${locationName(locationId)}`,
        before: null,
        after: preparedOf(record),
      });
      return HttpResponse.json(preparedOf(record), { status: 201 });
    }),
  ),

  /** Couldn't be resold: wastage, staff meal, disposed or other (with a reason). */
  http.post(
    `${API}/prepared-items/:id/dispose`,
    handle(async ({ request, params }) => {
      const ctx = preparedContext(request);
      const item = findPrepared(ctx, String(params.id));
      if (item.status !== 'AVAILABLE' || item.remaining <= 0) {
        throw new MockHttpError('CONFLICT', 409, `Prepared item is ${item.status}`, {
          status: item.status,
        });
      }
      const input = await parseBody(request, disposePreparedSchema);
      // A recipe dish's ingredients were used when it was cooked; finished items leave stock now.
      if (!activeRecipe(db.get(), ctx.me.tenant.id, item.productId)) {
        postMovement(ctx, {
          productId: item.productId,
          locationId: item.locationId,
          type: input.outcome === 'STAFF_MEAL' ? 'STAFF_MEAL' : 'WASTAGE',
          quantity: -item.remaining,
          reference: { kind: 'ADJUSTMENT', id: item.id, number: 'Prepared queue' },
          note: `Prepared item ${input.outcome.toLowerCase().replace('_', ' ')}: ${input.reason}`,
        });
      }
      const updated: PreparedRecord = {
        ...item,
        status: 'DISPOSED',
        remaining: 0,
        disposal: {
          outcome: input.outcome,
          reason: input.reason,
          quantity: item.remaining,
          by: ctx.me.user.displayName,
          at: nowIso(),
        },
      };
      db.update((d) => {
        d.preparedItems = d.preparedItems.map((p) => (p.id === item.id ? updated : p));
      });
      recordAudit(ctx, {
        action: 'recipes.prepared.dispose',
        entity: 'prepared-item',
        entityId: item.id,
        entityLabel: `${item.productName} ×${item.remaining} · ${input.outcome} · ${input.reason}`,
        before: preparedOf(item),
        after: preparedOf(updated),
      });
      return HttpResponse.json(preparedOf(updated));
    }),
  ),
];
