import type { ApiError } from '@rbp/api-client';
import type { SensitiveActionCode } from '@rbp/types';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(
  email: string,
  locationId = 'loc_01MAIN',
  deviceId: string | null = 'dev_01',
) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(locationId);
  useSessionStore.getState().setDevice(deviceId);
}

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ApiError) => e,
  );

async function pin(code: string, action: SensitiveActionCode, reasonCode = 'CUSTOMER_CHANGED') {
  const { verificationId } = await api.identity.verifyEmployee({ pin: code, action });
  return { verificationId, reasonCode };
}

const lkr = (rupees: number) => ({ amount: Math.round(rupees * 100), currency: 'LKR' as const });

const MAIN = 'loc_01MAIN';
const CHICKEN = 'ing_01CHICKEN';
const RICE = 'ing_01RICE';
const VEG = 'ing_01VEG';

const onHand = async (id: string) =>
  (await api.ingredients.list({ locationId: MAIN })).find((i) => i.id === id)!.levels[0]!.onHand;

const recipeOf = async (productId: string) =>
  (await api.recipes.list(MAIN)).recipes.find((r) => r.productId === productId)!;

const tile = async (productId: string) =>
  (await api.catalog.locationProducts.list()).find((p) => p.productId === productId)!;

async function sell(lines: { productId: string; quantity: number }[]) {
  const order = await api.orders.create({ lines, adjustmentIds: [], status: 'OPEN' });
  return api.orders.pay(order.id, { method: 'CASH', tendered: lkr(20000) });
}

describe('mock recipes: REC-001/002 ingredients and can make', () => {
  it('works out "can make" from the scarcest ingredient plus prepared plates', async () => {
    await signInAs('owner@pilot.demo');
    // BAK raw materials (M-codes) are ingredients too, stocked at the Bakery.
    const ingredients = (await api.ingredients.list({ locationId: MAIN })).filter((i) =>
      i.code.startsWith('I'),
    );
    expect(ingredients.map((i) => [i.code, i.levels[0]?.onHand, i.levels[0]?.status])).toEqual([
      ['I01', 35, 'OK'],
      ['I04', 30, 'OK'],
      ['I02', 60, 'OK'],
      ['I03', 40, 'OK'],
    ]);
    expect(ingredients.find((i) => i.id === CHICKEN)?.usedIn.map((u) => u.name)).toEqual([
      'Chicken Rice & Curry',
    ]);
    // Bakery formulas count too (QA REC-001): flour goes into the breads and cakes.
    const flour = (await api.ingredients.list({ locationId: 'loc_01BAKERY' })).find(
      (i) => i.code === 'M01',
    );
    expect(flour?.usedIn.map((u) => u.name)).toContain('Sandwich Bread (450g)');

    // Chicken Rice & Curry: chicken 35 → 35 plates, plus the one prepared plate.
    expect((await recipeOf('prd_01R01')).availability).toMatchObject({
      canMake: 36,
      fromIngredients: 35,
      prepared: 1,
      limitedBy: { name: 'Chicken' },
    });
    // Egg Fried Rice: 2 eggs a plate; its prepared plate has expired.
    expect((await recipeOf('prd_01R04')).availability).toMatchObject({
      canMake: 15,
      prepared: 0,
      limitedBy: { name: 'Egg' },
    });
    // The POS tile shows the same, and made-to-order dishes aren't finished stock any more.
    expect((await tile('prd_01R01')).stock).toMatchObject({
      onHand: 36,
      madeToOrder: true,
      prepared: 1,
    });
    const stock = await api.inventory.list({ pageSize: 100 });
    expect(stock.items.some((l) => l.code === 'R01')).toBe(false);
    expect(stock.items.some((l) => l.code === 'I01')).toBe(true);
    // Ingredients are never sold.
    expect((await api.catalog.locationProducts.list()).some((p) => p.code === 'I01')).toBe(false);
  });

  it('creates and edits an ingredient with its portion and minimum', async () => {
    await signInAs('manager@pilot.demo');
    const created = await api.ingredients.create({
      code: 'i05',
      name: 'Coconut milk',
      unit: 'portion',
      portion: { description: '100 ml', perPack: 4 },
      minStock: 5,
      locationId: MAIN,
    });
    expect(created).toMatchObject({
      code: 'I05',
      levels: [{ onHand: 0, minStock: 5, status: 'OUT' }],
    });
    expect(
      await fail(api.ingredients.create({ code: 'I05', name: 'Other', unit: 'pcs' })),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
    const updated = await api.ingredients.update(created.id, {
      code: 'I05',
      name: 'Coconut milk',
      unit: 'portion',
      portion: { description: '120 ml', perPack: 4 },
      locationId: MAIN,
    });
    expect(updated.portion?.description).toBe('120 ml');
    // Names are unique, ignoring case, on create and on edit (QA REC-001).
    expect(
      await fail(api.ingredients.create({ code: 'I09', name: ' chicken ', unit: 'portion' })),
    ).toMatchObject({ details: { fieldErrors: { name: 'validation.ingredientTaken' } } });
    expect(
      await fail(
        api.ingredients.update(created.id, { code: 'I05', name: 'CHICKEN', unit: 'portion' }),
      ),
    ).toMatchObject({ details: { fieldErrors: { name: 'validation.ingredientTaken' } } });
  });
});

describe('mock recipes: selling a recipe dish (portion deduction)', () => {
  it('uses the prepared plate first, then ingredients; a void puts them back', async () => {
    await signInAs('cashier@pilot.demo');
    const paid = await sell([{ productId: 'prd_01R01', quantity: 2 }]);

    // One plate from the queue, one cooked: 1 chicken, 1 rice, 1 vegetables.
    expect(await onHand(CHICKEN).catch(() => null)).toBeNull(); // cashier can't see REC
    await signInAs('owner@pilot.demo');
    expect([await onHand(CHICKEN), await onHand(RICE), await onHand(VEG)]).toEqual([34, 59, 39]);
    const used = await api.stockMovements.list({
      productId: CHICKEN,
      type: 'PRODUCTION_CONSUMPTION',
    });
    expect(used.items[0]).toMatchObject({
      quantity: -1,
      reference: { kind: 'ORDER', number: paid.number },
    });
    // No finished-stock SALE for the dish.
    expect(
      (await api.stockMovements.list({ productId: 'prd_01R01', type: 'SALE' })).items.some(
        (m) => m.reference.number === paid.number,
      ),
    ).toBe(false);
    const queue = await api.preparedItems.list({ locationId: MAIN });
    expect(queue.find((p) => p.id === 'prep_seed_1')).toMatchObject({
      status: 'USED',
      remaining: 0,
      uses: [{ orderNumber: paid.number, quantity: 1 }],
    });

    await signInAs('cashier@pilot.demo');
    await api.orders.void(paid.id, {
      verification: await pin('2222', 'pos.invoice.void', 'DUPLICATE_SALE'),
    });
    await signInAs('owner@pilot.demo');
    // The cooked plate's ingredients come back; the prepared plate isn't re-queued.
    expect([await onHand(CHICKEN), await onHand(RICE), await onHand(VEG)]).toEqual([35, 60, 40]);
  });

  it('adds up shared ingredients across dishes and blocks what can’t be made', async () => {
    await signInAs('cashier@pilot.demo');
    // Each fits alone, but together (25 − 1 prepared) + 9×2 = 42 vegetables; there are 40.
    expect(
      await fail(
        api.orders.create({
          lines: [
            { productId: 'prd_01R01', quantity: 25 },
            { productId: 'prd_01R02', quantity: 9 },
          ],
          adjustmentIds: [],
          status: 'OPEN',
        }),
      ),
    ).toMatchObject({
      code: 'CONFLICT',
      details: { reason: 'OUT_OF_STOCK', items: [{ name: 'Vegetables', onHand: 40 }] },
    });

    // A recipe needing more chicken than there is: the dish is out of stock on the POS.
    await signInAs('owner@pilot.demo');
    await api.recipes.save(
      'prd_01R01',
      {
        lines: [
          { ingredientId: RICE, quantity: 1 },
          { ingredientId: CHICKEN, quantity: 100 },
        ],
        isActive: true,
      },
      MAIN,
    );
    // Only the prepared plate can still be sold; after it, the dish is out of stock.
    expect((await tile('prd_01R01')).stock).toMatchObject({ onHand: 1, prepared: 1 });
    await signInAs('cashier@pilot.demo');
    await sell([{ productId: 'prd_01R01', quantity: 1 }]);
    expect((await tile('prd_01R01')).stock).toMatchObject({ onHand: 0, status: 'OUT' });
    expect(
      await fail(
        api.orders.create({
          lines: [{ productId: 'prd_01R01', quantity: 1 }],
          adjustmentIds: [],
          status: 'OPEN',
        }),
      ),
    ).toMatchObject({ code: 'CONFLICT', details: { items: [{ name: 'Chicken' }] } });
    await signInAs('owner@pilot.demo');
    // Paused: back to finished-stock tracking.
    await api.recipes.save(
      'prd_01R01',
      { lines: [{ ingredientId: RICE, quantity: 1 }], isActive: false },
      MAIN,
    );
    expect((await tile('prd_01R01')).stock?.madeToOrder).toBeUndefined();
    await api.recipes.save(
      'prd_01R01',
      {
        lines: [
          { ingredientId: RICE, quantity: 1 },
          { ingredientId: CHICKEN, quantity: 1 },
          { ingredientId: VEG, quantity: 1 },
        ],
        isActive: true,
      },
      MAIN,
    );
    expect((await recipeOf('prd_01R01')).availability.canMake).toBe(35);
    expect(
      await fail(
        api.recipes.save(
          'prd_01R01',
          {
            lines: [
              { ingredientId: RICE, quantity: 1 },
              { ingredientId: RICE, quantity: 2 },
            ],
            isActive: true,
          },
          MAIN,
        ),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('mock recipes: REC-005 prepared item queue (SCN-004)', () => {
  it('Resell queues the cooked plate, and the next order uses it without cooking', async () => {
    await signInAs('waiter@pilot.demo');
    const order = await api.orders.create({
      lines: [{ productId: 'prd_01R01', quantity: 1 }],
      adjustmentIds: [],
      status: 'OPEN',
      type: 'DINE_IN',
      tableId: 'tbl_T6',
    });
    const { order: sent } = await api.orders.sendToKitchen(order.id);
    const line = sent.lines[0]!;
    await api.orders.cancelItem(order.id, line.id, {
      quantity: 1,
      disposition: 'RESALE',
      verification: await pin('2222', 'pos.item.remove', 'CUSTOMER_CANCELLED'),
    });

    await signInAs('kitchen@pilot.demo', MAIN, null);
    const queued = (await api.preparedItems.list({ locationId: MAIN, status: 'AVAILABLE' })).find(
      (p) => p.source.orderId === order.id,
    );
    expect(queued).toMatchObject({
      productName: 'Chicken Rice & Curry',
      remaining: 1,
      source: { kind: 'KOT_CANCEL', orderNumber: order.number },
    });
    // The kitchen runs the queue but not recipes.
    expect(await fail(api.recipes.list(MAIN))).toMatchObject({ code: 'FORBIDDEN' });

    await signInAs('owner@pilot.demo');
    const chicken = await onHand(CHICKEN);
    // Two plates: the seeded prepared plate (oldest first) and the one just queued.
    await signInAs('cashier@pilot.demo');
    const paid = await sell([{ productId: 'prd_01R01', quantity: 2 }]);
    await signInAs('owner@pilot.demo');
    expect(await onHand(CHICKEN)).toBe(chicken);
    const after = (await api.preparedItems.list({ locationId: MAIN })).find(
      (p) => p.id === queued!.id,
    );
    expect(after).toMatchObject({ status: 'USED', uses: [{ orderNumber: paid.number }] });
  });

  it('disposes of an expired plate with an outcome and reason (audited)', async () => {
    await signInAs('kitchen@pilot.demo', MAIN, null);
    const [expired] = await api.preparedItems.list({ locationId: MAIN, status: 'EXPIRED' });
    expect(expired).toMatchObject({ id: 'prep_seed_2', productName: 'Egg Fried Rice' });
    expect(
      await fail(api.preparedItems.dispose(expired!.id, { outcome: 'WASTAGE', reason: '' })),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
    const disposed = await api.preparedItems.dispose(expired!.id, {
      outcome: 'WASTAGE',
      reason: 'Past its time',
    });
    expect(disposed).toMatchObject({
      status: 'DISPOSED',
      remaining: 0,
      disposal: { outcome: 'WASTAGE', quantity: 1, by: 'Arun Selvam' },
    });
    expect(
      await fail(api.preparedItems.dispose(expired!.id, { outcome: 'WASTAGE', reason: 'Again' })),
    ).toMatchObject({ code: 'CONFLICT' });

    await signInAs('owner@pilot.demo');
    const audit = await api.audit.list({ entity: 'prepared-item', entityId: expired!.id });
    expect(audit.items[0]?.action).toBe('recipes.prepared.dispose');
  });

  it('made extra: a recipe dish uses its ingredients when it’s added', async () => {
    await signInAs('owner@pilot.demo');
    const eggs = await onHand('ing_01EGG');
    const added = await api.preparedItems.create({ productId: 'prd_01R04', quantity: 2 });
    expect(added).toMatchObject({ status: 'AVAILABLE', remaining: 2, source: { kind: 'MANUAL' } });
    expect(await onHand('ing_01EGG')).toBe(eggs - 4);
    expect((await tile('prd_01R04')).stock).toMatchObject({ prepared: 2 });
  });

  it('needs the RECIPES feature and the right permission', async () => {
    await signInAs('cashier@pilot.demo');
    expect(await fail(api.recipes.list(MAIN))).toMatchObject({ code: 'FORBIDDEN' });
    expect(await fail(api.preparedItems.list({ locationId: MAIN }))).toMatchObject({
      code: 'FORBIDDEN',
    });
    await signInAs('owner@grocery.demo', 'loc_02TOWN', null);
    expect(await fail(api.ingredients.list())).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
  });
});
