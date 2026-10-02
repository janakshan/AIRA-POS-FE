import type { ApiError } from '@rbp/api-client';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(email: string, locationId: string | null = null) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(locationId);
}

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ApiError) => e,
  );

const newProduct = {
  categoryId: 'cat_01SHORT',
  code: 'S99',
  name: 'Egg Roll',
  basePrice: { amount: 16000, currency: 'LKR' as const },
  taxMode: 'INCLUSIVE' as const,
};

describe('mock catalog API', () => {
  it('lists categories for the token’s tenant only, in sort order', async () => {
    await signInAs('owner@pilot.demo');
    const pilot = await api.catalog.categories.list({ parentId: 'root' });
    expect(pilot.items.map((c) => c.code)).toEqual([
      'RICE',
      'KOTTU',
      'SHORT',
      'BAKERY',
      'DRINKS',
      'HOPPERS',
      'NOODLES',
      'SOUPS',
      'DEVILLED',
      'DESSERTS',
    ]);

    await signInAs('owner@grocery.demo');
    const grocery = await api.catalog.categories.list({ parentId: 'root' });
    expect(grocery.items.map((c) => c.code)).toEqual(['DAIRY', 'DRY']);
  });

  it('paginates products and clamps page size', async () => {
    await signInAs('owner@pilot.demo');
    const page2 = await api.catalog.products.list({ page: 2, pageSize: 5 });
    expect(page2).toMatchObject({ page: 2, pageSize: 5, total: 82 });
    expect(page2.items).toHaveLength(5);
    expect(page2.items[0]!.code).toBe('B06'); // sorted by code: B01–B05 on page 1

    const huge = await api.catalog.products.list({ pageSize: 1000 });
    expect(huge.pageSize).toBe(100);

    const beyond = await api.catalog.products.list({ page: 99 });
    expect(beyond.items).toEqual([]);
  });

  it('filters products by search (name, code, barcode), category and active flag', async () => {
    await signInAs('owner@pilot.demo');
    const byName = await api.catalog.products.list({ search: 'kottu' });
    expect(byName.items.map((p) => p.code)).toEqual([
      'K01',
      'K02',
      'K03',
      'K04',
      'K05',
      'K06',
      'K07',
      'K08',
      'K09',
    ]);

    const byBarcode = await api.catalog.products.list({ search: '4790001000123' });
    expect(byBarcode.items.map((p) => p.code)).toEqual(['B03']);

    const drinks = await api.catalog.products.list({ categoryId: 'cat_01DRINKS', active: true });
    expect(drinks.items.map((p) => p.code)).toEqual([
      'D01',
      'D02',
      'D03',
      'D05',
      'D06',
      'D07',
      'D08',
      'D09',
      'D10',
      'D11',
      'D12',
      'D13',
      'D14',
    ]);

    const inactive = await api.catalog.products.list({ active: false });
    expect(inactive.items.map((p) => p.code)).toEqual(['D04']);
  });

  it('hides other tenants’ products as NOT_FOUND', async () => {
    await signInAs('owner@grocery.demo');
    const error = await fail(api.catalog.products.get('prd_01R01'));
    expect(error).toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(await fail(api.catalog.products.update('prd_01R01', { name: 'Hacked' }))).toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('requires catalog.manage to write and catalog.view to read', async () => {
    await signInAs('cashier@pilot.demo');
    expect(await fail(api.catalog.products.create(newProduct))).toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
      details: { permission: 'catalog.manage' },
    });

    await signInAs('kitchen@pilot.demo');
    expect(await fail(api.catalog.categories.list())).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('validates bodies with the shared schemas and reports field errors', async () => {
    await signInAs('owner@pilot.demo');
    const error = await fail(
      api.catalog.products.create({
        ...newProduct,
        name: 'x',
        basePrice: { amount: 12.5, currency: 'LKR' },
      }),
    );
    expect(error).toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
    expect(error!.details!.fieldErrors).toMatchObject({
      name: 'validation.nameMin',
      'basePrice.amount': 'validation.priceMinorUnits',
    });

    const badCategory = await fail(
      api.catalog.products.create({ ...newProduct, categoryId: 'cat_02DAIRY' }),
    );
    expect(badCategory!.details!.fieldErrors).toEqual({
      categoryId: 'validation.categoryRequired',
    });
  });

  it('rejects duplicate codes with CONFLICT', async () => {
    await signInAs('owner@pilot.demo');
    expect(await fail(api.catalog.products.create({ ...newProduct, code: 'r01' }))).toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
    expect(
      await fail(api.catalog.categories.create({ code: 'KOTTU', name: 'Kottu 2', color: 'red' })),
    ).toMatchObject({ code: 'CONFLICT' });
    // Codes are per tenant: the grocery tenant may reuse them.
    await signInAs('owner@grocery.demo');
    const created = await api.catalog.categories.create({
      code: 'KOTTU',
      name: 'Ready meals',
      color: 'red',
    });
    expect(created.tenantId).toBe('ten_02GROCERY');
  });

  it('keeps barcodes unique across the tenant and within a product', async () => {
    await signInAs('owner@pilot.demo');
    // 4790001000123 belongs to Sandwich Bread (B03).
    const taken = { ...newProduct, barcodes: ['4790001000123'] };
    expect(await fail(api.catalog.products.create(taken))).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fieldErrors: { barcodes: 'validation.barcodeTaken' } },
    });
    expect(
      await fail(api.catalog.products.create({ ...newProduct, barcodes: ['111', '111'] })),
    ).toMatchObject({ details: { fieldErrors: { barcodes: 'validation.barcodeDuplicate' } } });

    const created = await api.catalog.products.create({ ...newProduct, barcodes: ['222'] });
    expect(
      await fail(api.catalog.products.update(created.id, { barcodes: ['222', '4790001000123'] })),
    ).toMatchObject({ details: { fieldErrors: { barcodes: 'validation.barcodeTaken' } } });
    // Re-saving a product with its own barcodes is fine.
    const b03 = (await api.catalog.products.list({ search: 'B03' })).items[0]!;
    await expect(
      api.catalog.products.update(b03.id, { barcodes: b03.barcodes }),
    ).resolves.toMatchObject({ barcodes: ['4790001000123'] });
  });

  it('creates and updates products', async () => {
    await signInAs('manager@pilot.demo');
    const created = await api.catalog.products.create(newProduct);
    expect(created).toMatchObject({ code: 'S99', isActive: true, barcodes: [] });
    expect(await api.catalog.products.get(created.id)).toEqual(created);

    const updated = await api.catalog.products.update(created.id, {
      basePrice: { amount: 17500, currency: 'LKR' },
      isActive: false,
    });
    expect(updated).toMatchObject({ basePrice: { amount: 17500 }, isActive: false, code: 'S99' });
  });

  describe('location products', () => {
    it('requires a selected location', async () => {
      await signInAs('owner@pilot.demo');
      expect(await fail(api.catalog.locationProducts.list())).toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });

    it('returns what the location sells, at its effective price, without inactive products', async () => {
      await signInAs('cashier@pilot.demo', 'loc_01MAIN');
      const main = await api.catalog.locationProducts.list();
      expect(main).toHaveLength(81);
      expect(main.find((p) => p.code === 'D04')).toBeUndefined();
      expect(main.find((p) => p.code === 'D03')).toMatchObject({
        price: { amount: 40000 },
        priceOverride: { amount: 40000 },
      });
      expect(main.find((p) => p.code === 'R06')?.isAvailable).toBe(false);
      expect(main.find((p) => p.code === 'R03')?.stockNote).toBe('3 left');
      expect(main.map((p) => p.quickPadOrder)).toEqual(
        [...main.map((p) => p.quickPadOrder)].sort((a, b) => a - b),
      );
    });

    it('differs per location of the same tenant', async () => {
      await signInAs('manager@pilot.demo', 'loc_01BAKERY');
      const bakery = await api.catalog.locationProducts.list();
      expect(new Set(bakery.map((p) => p.categoryId))).toEqual(
        new Set(['cat_01BAKERY', 'cat_01HOT', 'cat_01COLD', 'cat_01SHORT']),
      );
      expect(bakery.find((p) => p.code === 'D01')?.price.amount).toBe(7000);
    });

    it('reflects product deactivation immediately', async () => {
      await signInAs('owner@pilot.demo', 'loc_01MAIN');
      await api.catalog.products.update('prd_01S01', { isActive: false });
      const main = await api.catalog.locationProducts.list();
      expect(main.find((p) => p.code === 'S01')).toBeUndefined();
    });

    it('is denied to roles that neither sell nor view the catalog', async () => {
      await signInAs('kitchen@pilot.demo', 'loc_01MAIN');
      expect(await fail(api.catalog.locationProducts.list())).toMatchObject({ code: 'FORBIDDEN' });
    });
  });

  describe('category tree', () => {
    it('returns every category depth-first with depth, path and direct counts', async () => {
      await signInAs('owner@pilot.demo');
      const tree = await api.catalog.categories.tree();
      expect(tree.map((c) => `${'-'.repeat(c.depth)}${c.code}`)).toEqual([
        'RICE',
        '-FRIED',
        '-BIRIYANI',
        'KOTTU',
        'SHORT',
        'BAKERY',
        'DRINKS',
        '-HOT',
        '-COLD',
        'HOPPERS',
        'NOODLES',
        'SOUPS',
        'DEVILLED',
        'DESSERTS',
      ]);
      expect(tree.find((c) => c.code === 'FRIED')).toMatchObject({
        path: ['Rice & Curry'],
        productCount: 5,
        childCount: 0,
      });
      expect(tree.find((c) => c.code === 'RICE')).toMatchObject({ productCount: 7, childCount: 2 });
    });

    it('filters products by a category including its descendants', async () => {
      await signInAs('owner@pilot.demo');
      const rice = await api.catalog.products.list({ categoryId: 'cat_01RICE' });
      expect(rice.total).toBe(16);
    });

    it('rejects moving a category inside its own subtree', async () => {
      await signInAs('owner@pilot.demo');
      const error = await fail(
        api.catalog.categories.update('cat_01RICE', { parentId: 'cat_01FRIED' }),
      );
      expect(error).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(error!.details!.fieldErrors).toEqual({ parentId: 'validation.categoryCycle' });
    });

    it('blocks deactivating a category that still has active children or products', async () => {
      await signInAs('owner@pilot.demo');
      expect(
        await fail(api.catalog.categories.update('cat_01RICE', { isActive: false })),
      ).toMatchObject({ code: 'CONFLICT', details: { children: 2, products: 7 } });

      const empty = await api.catalog.categories.create({
        code: 'SEASONAL',
        name: 'Seasonal',
        color: 'red',
        parentId: 'cat_01SHORT',
      });
      const off = await api.catalog.categories.update(empty.id, { isActive: false });
      expect(off.isActive).toBe(false);
      const activeTree = await api.catalog.categories.tree({ active: true });
      expect(activeTree.some((c) => c.id === empty.id)).toBe(false);
    });

    it('audits category changes', async () => {
      await signInAs('owner@pilot.demo');
      await api.catalog.categories.update('cat_01KOTTU', { name: 'Kottu Roti' });
      const events = await api.audit.list({ entity: 'category', entityId: 'cat_01KOTTU' });
      expect(events.items[0]).toMatchObject({
        action: 'catalog.category.update',
        userName: 'Nirmala Rajan',
        before: { name: 'Kottu' },
        after: { name: 'Kottu Roti' },
      });
    });
  });

  describe('location product setup (CAT-005)', () => {
    it('switches a product on for a location by creating its row, and off without deleting it', async () => {
      await signInAs('manager@pilot.demo', 'loc_01BAKERY');
      const all = await api.catalog.locationProducts.list({ all: true });
      expect(all.find((p) => p.code === 'K01')).toMatchObject({ enabled: false });

      await api.catalog.locationProducts.update('prd_01K01', 'loc_01BAKERY', { enabled: true });
      let sold = await api.catalog.locationProducts.list();
      expect(sold.some((p) => p.code === 'K01')).toBe(true);

      await api.catalog.locationProducts.update('prd_01D01', 'loc_01BAKERY', { enabled: false });
      sold = await api.catalog.locationProducts.list();
      expect(sold.some((p) => p.code === 'D01')).toBe(false);
      // The Rs 70 override survives being switched off.
      const again = await api.catalog.locationProducts.update('prd_01D01', 'loc_01BAKERY', {
        enabled: true,
      });
      expect(again.price.amount).toBe(7000);
    });

    it('lets the back office manage another allowed location, but not a foreign one', async () => {
      await signInAs('manager@pilot.demo', 'loc_01MAIN');
      const bakery = await api.catalog.locationProducts.list({
        locationId: 'loc_01BAKERY',
        all: true,
      });
      expect(bakery.every((p) => p.locationId === 'loc_01BAKERY')).toBe(true);

      await signInAs('cashier@pilot.demo', 'loc_01MAIN');
      expect(
        await fail(api.catalog.locationProducts.list({ locationId: 'loc_01BAKERY' })),
      ).toMatchObject({ code: 'LOCATION_NOT_ALLOWED' });
      expect(await fail(api.catalog.locationProducts.list({ all: true }))).toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('pricing (CAT-006)', () => {
    async function verify(pin: string) {
      const v = await api.identity.verifyEmployee({ pin, action: 'pos.price.override' });
      return v.verificationId;
    }

    it('returns a price grid with a column per allowed location', async () => {
      await signInAs('manager@pilot.demo', 'loc_01MAIN');
      const matrix = await api.catalog.prices.matrix({ categoryId: 'cat_01HOT' });
      expect(matrix.locations.map((l) => l.code).sort()).toEqual(['BAK', 'MAIN']);
      expect(matrix.items.find((r) => r.code === 'D01')).toMatchObject({
        basePrice: { amount: 8000 },
        prices: { loc_01MAIN: null, loc_01BAKERY: { amount: 7000 } },
        enabled: { loc_01MAIN: true, loc_01BAKERY: true },
      });
    });

    it('applies price increases without verification and audits each change', async () => {
      await signInAs('manager@pilot.demo', 'loc_01MAIN');
      const result = await api.catalog.prices.update({
        changes: [
          { productId: 'prd_01K01', locationId: null, price: { amount: 95000, currency: 'LKR' } },
          {
            productId: 'prd_01K01',
            locationId: 'loc_01BAKERY',
            price: { amount: 99000, currency: 'LKR' },
          },
        ],
      });
      expect(result.updated).toBe(2);
      const product = await api.catalog.products.get('prd_01K01');
      expect(product.basePrice.amount).toBe(95000);
      const events = await api.audit.list({ action: 'catalog.price.change' });
      expect(events.items.map((e) => e.entityLabel)).toEqual([
        'Chicken Kottu · Bakery Outlet',
        'Chicken Kottu · Base price',
      ]);
      expect(events.items[0]!.employee).toBeNull();
    });

    it('requires a PIN from an employee with pos.price.override to lower a price', async () => {
      await signInAs('manager@pilot.demo', 'loc_01MAIN');
      const lower = {
        changes: [
          {
            productId: 'prd_01R01',
            locationId: 'loc_01MAIN',
            price: { amount: 70000, currency: 'LKR' as const },
          },
        ],
      };
      expect(await fail(api.catalog.prices.update(lower))).toMatchObject({
        code: 'VERIFICATION_REQUIRED',
        status: 428,
      });

      // Fathima (cashier) is refused at the PIN step: she lacks the permission (SCN-006).
      expect(await fail(verify('3333'))).toMatchObject({
        code: 'EMPLOYEE_NOT_AUTHORIZED',
        details: { employee: 'Fathima Rizvi' },
      });

      const managerPin = await verify('2222');
      const verification = {
        verificationId: managerPin,
        reasonCode: 'OTHER',
        reasonComment: 'Lunch promotion',
      };
      await api.catalog.prices.update({ ...lower, verification });
      const [event] = (await api.audit.list({ action: 'catalog.price.change' })).items;
      expect(event).toMatchObject({
        employee: { fullName: 'Suresh Kumar' },
        reason: { code: 'OTHER', label: 'Other', comment: 'Lunch promotion' },
        before: null,
        after: { amount: 70000 },
      });

      // A verification can only be used once.
      const lowerAgain = {
        changes: [
          {
            productId: 'prd_01R01',
            locationId: 'loc_01MAIN',
            price: { amount: 65000, currency: 'LKR' as const },
          },
        ],
        verification,
      };
      expect(await fail(api.catalog.prices.update(lowerAgain))).toMatchObject({
        code: 'VERIFICATION_REQUIRED',
      });
    });

    it('refuses a comment-less "Other" reason', async () => {
      await signInAs('manager@pilot.demo', 'loc_01MAIN');
      const verificationId = await verify('2222');
      const error = await fail(
        api.catalog.prices.update({
          changes: [
            { productId: 'prd_01R01', locationId: null, price: { amount: 100, currency: 'LKR' } },
          ],
          verification: { verificationId, reasonCode: 'OTHER' },
        }),
      );
      expect(error!.details!.fieldErrors).toEqual({ reasonComment: 'validation.commentRequired' });
    });
  });

  describe('quick pad layout (CAT-007)', () => {
    it('defaults to catalog order and persists a saved order the POS feed follows', async () => {
      await signInAs('owner@pilot.demo', 'loc_01MAIN');
      const layout = await api.catalog.quickPad.get('loc_01MAIN');
      expect(layout.updatedAt).toBeNull();
      expect(layout.categoryOrder.slice(0, 3)).toEqual([
        'cat_01RICE',
        'cat_01FRIED',
        'cat_01BIRIYANI',
      ]);
      expect(layout.productOrder.cat_01SHORT?.slice(0, 5)).toEqual([
        'prd_01S01',
        'prd_01S02',
        'prd_01S03',
        'prd_01S04',
        'prd_01S05',
      ]);

      const saved = await api.catalog.quickPad.update('loc_01MAIN', {
        categoryOrder: ['cat_01SHORT', ...layout.categoryOrder.filter((c) => c !== 'cat_01SHORT')],
        categoryColors: { cat_01SHORT: '#ff8800' },
        productOrder: { ...layout.productOrder, cat_01SHORT: ['prd_01S05', 'prd_01S01'] },
      });
      expect(saved.updatedAt).not.toBeNull();
      expect(saved.categoryOrder[0]).toBe('cat_01SHORT');
      // Items missing from the saved order are appended, not dropped.
      expect(saved.productOrder.cat_01SHORT?.slice(0, 5)).toEqual([
        'prd_01S05',
        'prd_01S01',
        'prd_01S02',
        'prd_01S03',
        'prd_01S04',
      ]);

      const feed = await api.catalog.locationProducts.list();
      expect(
        feed
          .filter((p) => p.categoryId === 'cat_01SHORT')
          .map((p) => p.code)
          .slice(0, 5),
      ).toEqual(['S05', 'S01', 'S02', 'S03', 'S04']);
    });

    it('is readable by POS staff but only catalog managers can save', async () => {
      await signInAs('cashier@pilot.demo', 'loc_01MAIN');
      const layout = await api.catalog.quickPad.get('loc_01MAIN');
      expect(await fail(api.catalog.quickPad.update('loc_01MAIN', layout))).toMatchObject({
        code: 'FORBIDDEN',
      });
    });
  });

  describe('P1 completion: translations, images, stations, device layouts', () => {
    it('stores Tamil/Sinhala names (blanks dropped) and validates button images', async () => {
      await signInAs('owner@pilot.demo', 'loc_01MAIN');
      const created = await api.catalog.products.create({
        ...newProduct,
        nameTranslations: { ta: 'முட்டை ரோல்', si: '  ' },
        imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      });
      expect(created.nameTranslations).toEqual({ ta: 'முட்டை ரோல்' });
      expect(created.imageUrl).toMatch(/^data:image\/png/);

      const bad = await fail(
        api.catalog.products.update(created.id, { imageUrl: 'javascript:alert(1)' }),
      );
      expect(bad!.details!.fieldErrors).toEqual({ imageUrl: 'validation.imageFormat' });

      await api.catalog.locationProducts.update(created.id, 'loc_01MAIN', { enabled: true });
      const feed = await api.catalog.locationProducts.list();
      expect(feed.find((p) => p.productId === created.id)).toMatchObject({
        nameTranslations: { ta: 'முட்டை ரோல்' },
        imageUrl: created.imageUrl,
      });
    });

    it('lists kitchen stations per location and routes products to them', async () => {
      await signInAs('manager@pilot.demo', 'loc_01MAIN');
      const main = await api.catalog.kitchenStations.list('loc_01MAIN');
      expect(main.map((s) => s.code)).toEqual(['KIT', 'BAR']);
      expect(main[1]).toMatchObject({ name: 'Beverage Bar', printerName: 'Bar Printer' });

      const feed = await api.catalog.locationProducts.list();
      expect(feed.find((p) => p.code === 'D01')).toMatchObject({
        stationId: 'st_01BAR',
        serviceCharge: true,
      });
      expect(feed.find((p) => p.code === 'S01')?.stationId).toBeNull();

      const moved = await api.catalog.locationProducts.update('prd_01S01', 'loc_01MAIN', {
        stationId: 'st_01KITCHEN',
        serviceCharge: false,
      });
      expect(moved).toMatchObject({ stationId: 'st_01KITCHEN', serviceCharge: false });

      // A station from another location is rejected.
      const error = await fail(
        api.catalog.locationProducts.update('prd_01S01', 'loc_01MAIN', {
          stationId: 'st_01BAKCOUNTER',
        }),
      );
      expect(error!.details!.fieldErrors).toEqual({ stationId: 'validation.stationRequired' });
    });

    it('resolves Quick Pad layouts device → location → default', async () => {
      await signInAs('owner@pilot.demo', 'loc_01MAIN');
      const devices = await api.identity.devices('loc_01MAIN');
      expect(devices.map((d) => d.id)).toEqual(['dev_01', 'dev_02', 'dev_03']);

      expect(await api.catalog.quickPad.get('loc_01MAIN', 'dev_02')).toMatchObject({
        deviceId: 'dev_02',
        source: 'default',
      });

      const location = await api.catalog.quickPad.get('loc_01MAIN');
      const withShortFirst = {
        ...location,
        categoryOrder: [
          'cat_01SHORT',
          ...location.categoryOrder.filter((c) => c !== 'cat_01SHORT'),
        ],
      };
      await api.catalog.quickPad.update('loc_01MAIN', withShortFirst);
      expect(await api.catalog.quickPad.get('loc_01MAIN', 'dev_02')).toMatchObject({
        source: 'location',
        categoryOrder: expect.arrayContaining(['cat_01SHORT']),
      });

      // The waiter tablet gets drinks first; the counter POS keeps the location layout.
      const tablet = await api.catalog.quickPad.update(
        'loc_01MAIN',
        {
          ...withShortFirst,
          categoryOrder: [
            'cat_01DRINKS',
            ...withShortFirst.categoryOrder.filter((c) => c !== 'cat_01DRINKS'),
          ],
        },
        'dev_02',
      );
      expect(tablet).toMatchObject({ source: 'device', deviceId: 'dev_02' });
      expect(tablet.categoryOrder[0]).toBe('cat_01DRINKS');
      expect((await api.catalog.quickPad.get('loc_01MAIN', 'dev_01')).categoryOrder[0]).toBe(
        'cat_01SHORT',
      );

      const reset = await api.catalog.quickPad.resetDevice('loc_01MAIN', 'dev_02');
      expect(reset).toMatchObject({ source: 'location' });
      expect(reset.categoryOrder[0]).toBe('cat_01SHORT');

      // A device from another location can't be targeted.
      expect(await fail(api.catalog.quickPad.get('loc_01MAIN', 'dev_04'))).toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });
});
