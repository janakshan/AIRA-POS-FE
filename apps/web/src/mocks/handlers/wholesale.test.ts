import type { ApiError } from '@rbp/api-client';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(
  email: string,
  locationId = 'loc_01VAN1',
  deviceId: string | null = 'dev_07',
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

async function pin(code: string, reasonCode: string) {
  const { verificationId } = await api.identity.verifyEmployee({
    pin: code,
    action: 'wholesale.return',
  });
  return { verificationId, reasonCode };
}

const VAN = 'loc_01VAN1';
const LAKSHMI = 'shp_001';
const SEA_VIEW = 'shp_006';
const NIMAL = 'shp_007';
const BREAD = 'prd_01B03';
const BUN = 'prd_01S01';

const vanStock = async (productId: string) =>
  (await api.wholesale.products(VAN)).find((p) => p.productId === productId)!.onHand;
const owed = async (shopId: string) => (await api.wholesale.shops.get(shopId)).outstanding.amount;

describe('mock wholesale: WHO-001/002/006 seeded shops and routes (SCN-008)', () => {
  it('derives balances, limits, overdue and a route for today', async () => {
    await signInAs('rep@pilot.demo');
    const { items, summary } = await api.wholesale.shops.list();
    expect(items).toHaveLength(8);
    const lakshmi = items.find((s) => s.id === LAKSHMI)!;
    expect(lakshmi).toMatchObject({
      outstanding: { amount: 2_466_000 },
      creditLimit: { amount: 2_500_000 },
      overLimit: false,
    });
    expect(items.find((s) => s.id === SEA_VIEW)!.overdue.amount).toBeGreaterThan(0);
    expect(items.find((s) => s.id === NIMAL)!.lastVisitAt).toBeNull();
    expect(summary.overdue.amount).toBeGreaterThan(0);
    expect(
      (await api.wholesale.shops.list({ balance: 'OVERDUE' })).items.map((s) => s.code),
    ).toEqual(expect.arrayContaining(['SHP-006', 'SHP-008']));
    // Phones match as displayed, local or international (stored +94771100105).
    for (const search of ['077 110 0105', '0771100105', '771100105', '+94 77 110 0105']) {
      expect((await api.wholesale.shops.list({ search })).items.map((s) => s.code)).toEqual([
        'SHP-005',
      ]);
    }
    for (const search of ['ruwan', 'SHP-001']) {
      expect((await api.wholesale.shops.list({ search })).items).toHaveLength(1);
    }

    // The statement's running balance ends on the outstanding.
    const ledger = await api.wholesale.shops.ledger(LAKSHMI);
    expect(ledger.at(-1)!.balance.amount).toBe(2_466_000);
    expect(ledger.map((l) => l.kind)).toEqual(
      expect.arrayContaining(['INVOICE', 'COLLECTION', 'RETURN']),
    );

    const routes = await api.wholesale.routes.list();
    const today = new Date().getDay();
    const route = routes.find((r) => r.days.includes(today))!;
    const overview = await api.wholesale.routes.overview(route.id);
    expect(overview.scheduled).toBe(true);
    expect(overview.stops.map((s) => s.shop.stopOrder)).toEqual([1, 2, 3, 4]);
    expect(overview.van.items.find((i) => i.productId === BREAD)?.onHand).toBe(40);
  });
});

describe('mock wholesale: FLOW-WHO-001 sale → credit → collection → return', () => {
  it('sells from the van, puts the rest on credit and warns over the limit', async () => {
    await signInAs('rep@pilot.demo');
    const bread = await vanStock(BREAD);
    const before = await owed(LAKSHMI);
    // 10 loaves @180 + 20 buns @95 = 3,700; 1,000 now, 2,700 on credit → over 25,000.
    const invoice = await api.wholesale.invoices.create({
      shopId: LAKSHMI,
      lines: [
        { productId: BREAD, quantity: 10 },
        { productId: BUN, quantity: 20 },
      ],
      paidNow: 100_000,
      method: 'CASH',
    });
    expect(invoice).toMatchObject({
      number: 'WIN-000012',
      total: { amount: 370_000 },
      credit: { amount: 270_000 },
      balance: { amount: 270_000 },
      status: 'OPEN',
      creditWarning: true,
      balanceBefore: { amount: before },
      balanceAfter: { amount: before + 270_000 },
      locationId: VAN,
    });
    // VAT is inside the price: 3,700 × 18/118.
    expect(invoice.tax.amount).toBe(56_441);
    expect(await vanStock(BREAD)).toBe(bread - 10);
    expect(await owed(LAKSHMI)).toBe(before + 270_000);
    expect((await api.wholesale.shops.get(LAKSHMI)).overLimit).toBe(true);
    const { items } = await api.stockMovements.list({ productId: BREAD, locationId: VAN });
    expect(items[0]).toMatchObject({
      type: 'SALE',
      quantity: -10,
      reference: { kind: 'WHOLESALE_INVOICE', number: invoice.number },
    });

    // Share + print are recorded.
    await api.wholesale.invoices.share(invoice.id, { channel: 'WHATSAPP' });
    const printed = await api.wholesale.invoices.print(invoice.id);
    expect(printed.shares.map((s) => s.channel)).toEqual(['WHATSAPP']);
    expect(printed.prints).toHaveLength(1);
  });

  it('applies collections to the oldest invoices first', async () => {
    await signInAs('rep@pilot.demo');
    const before = await owed(SEA_VIEW);
    const open = (await api.wholesale.invoices.list({ shopId: SEA_VIEW, status: 'OPEN' })).sort(
      (a, b) => a.at.localeCompare(b.at),
    );
    const oldest = open[0]!;
    const collection = await api.wholesale.collections.create({
      shopId: SEA_VIEW,
      amount: oldest.balance.amount + 50_000,
      method: 'CASH',
    });
    expect(collection.allocations.map((a) => a.invoiceId)).toEqual([oldest.id, open[1]!.id]);
    expect(collection.balanceAfter.amount).toBe(before - oldest.balance.amount - 50_000);
    expect((await api.wholesale.invoices.get(oldest.id)).status).toBe('PAID');
    expect(
      await fail(
        api.wholesale.collections.create({ shopId: SEA_VIEW, amount: before * 10, method: 'CASH' }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('takes returns back into the van; spoiled goods go out as wastage', async () => {
    await signInAs('rep@pilot.demo');
    const [invoice] = await api.wholesale.invoices.list({ shopId: LAKSHMI });
    const bread = await vanStock(BREAD);
    const buns = await vanStock(BUN);
    const before = await owed(LAKSHMI);
    const line = invoice!.lines.find((l) => l.productId === BREAD)!;
    const ret = await api.wholesale.returns.create({
      shopId: LAKSHMI,
      invoiceId: invoice!.id,
      lines: [
        { productId: BREAD, quantity: 2, condition: 'GOOD' },
        { productId: BREAD, quantity: 3, condition: 'EXPIRED' },
      ],
      verification: await pin('7777', 'EXPIRED'),
    });
    expect(ret).toMatchObject({
      credit: { amount: 5 * line.unitPrice.amount },
      approvedBy: 'Dinesh Kumar',
      invoiceNumber: invoice!.number,
    });
    expect(ret.movements.map((m) => [m.type, m.quantity])).toEqual([
      ['RETURN', 2],
      ['RETURN', 3],
      ['WASTAGE', -3],
    ]);
    expect(await vanStock(BREAD)).toBe(bread + 2);
    expect(await vanStock(BUN)).toBe(buns);
    expect(await owed(LAKSHMI)).toBe(before - 5 * line.unitPrice.amount);
    // Credited to the linked invoice first.
    expect(ret.allocations[0]?.invoiceId).toBe(invoice!.id);
    expect(
      (await api.wholesale.invoices.get(invoice!.id)).lines.find((l) => l.productId === BREAD),
    ).toMatchObject({ returnedQuantity: 5 });

    // Can't return more than was invoiced.
    expect(
      await fail(
        api.wholesale.returns.create({
          shopId: LAKSHMI,
          invoiceId: invoice!.id,
          lines: [{ productId: BREAD, quantity: line.quantity, condition: 'GOOD' }],
          verification: await pin('7777', 'EXPIRED'),
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
    // Needs a PIN.
    expect(
      await fail(
        api.wholesale.returns.create({
          shopId: LAKSHMI,
          lines: [{ productId: BUN, quantity: 1, condition: 'DAMAGED' }],
          verification: { verificationId: 'nope', reasonCode: 'DAMAGED' },
        }),
      ),
    ).toMatchObject({ code: 'VERIFICATION_REQUIRED' });
  });

  it("won't sell more than is in the van", async () => {
    await signInAs('rep@pilot.demo');
    expect(
      await fail(
        api.wholesale.invoices.create({
          shopId: NIMAL,
          lines: [{ productId: BREAD, quantity: 999 }],
          paidNow: 0,
        }),
      ),
    ).toMatchObject({ status: 409, details: { reason: 'OUT_OF_STOCK' } });
    expect(
      await fail(
        api.wholesale.invoices.create({
          shopId: NIMAL,
          lines: [{ productId: BREAD, quantity: 1 }],
          paidNow: 999_999,
          method: 'CASH',
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('mock wholesale: access', () => {
  it('needs WHOLESALE and wholesale.manage; the manager has no van', async () => {
    await signInAs('owner@grocery.demo', 'loc_02TOWN', 'dev_06');
    expect(await fail(api.wholesale.shops.list())).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
    await signInAs('cashier@pilot.demo', 'loc_01MAIN', 'dev_01');
    expect(await fail(api.wholesale.shops.list())).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs('manager@pilot.demo', 'loc_01MAIN', 'dev_01');
    expect((await api.wholesale.shops.list()).items).toHaveLength(8);
    expect(
      await fail(
        api.wholesale.invoices.create({
          shopId: NIMAL,
          lines: [{ productId: BREAD, quantity: 1 }],
          paidNow: 0,
        }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('creates a shop on a route at the end of the stops', async () => {
    await signInAs('rep@pilot.demo');
    const shop = await api.wholesale.shops.create({
      name: 'Beach Kiosk',
      phones: [{ number: '0771100199', primary: true }],
      routeId: 'rte_B',
      creditLimit: 500_000,
      paymentTermsDays: 7,
    });
    expect(shop).toMatchObject({
      code: 'SHP-009',
      stopOrder: 5,
      phones: [{ number: '+94771100199' }],
      outstanding: { amount: 0 },
    });
  });

  it('rejects a second shop with the same name or phone (WHO-001)', async () => {
    await signInAs('rep@pilot.demo');
    const lakshmi = await api.wholesale.shops.get(LAKSHMI);
    const phone = lakshmi.phones[0]!.number;
    const base = { routeId: null, creditLimit: 0, paymentTermsDays: 7 };
    expect(
      await fail(
        api.wholesale.shops.create({
          ...base,
          name: lakshmi.name.toUpperCase(),
          phones: [{ number: `0${phone.slice(3)}`, primary: true }],
        }),
      ),
    ).toMatchObject({
      code: 'CONFLICT',
      details: {
        fieldErrors: {
          name: 'validation.shopNameTaken',
          'phones.0.number': 'validation.shopPhoneTaken',
        },
      },
    });
    expect(
      await fail(
        api.wholesale.shops.create({
          ...base,
          name: 'Lakshmi Two',
          phones: [{ number: phone, primary: true }],
        }),
      ),
    ).toMatchObject({
      details: { fieldErrors: { 'phones.0.number': 'validation.shopPhoneTaken' } },
    });
    // Saving a shop unchanged doesn't clash with itself.
    expect(
      await api.wholesale.shops.update(LAKSHMI, {
        name: lakshmi.name,
        phones: lakshmi.phones,
        routeId: lakshmi.routeId,
        creditLimit: lakshmi.creditLimit.amount,
        paymentTermsDays: lakshmi.paymentTermsDays,
      }),
    ).toMatchObject({ id: LAKSHMI });
  });
});
