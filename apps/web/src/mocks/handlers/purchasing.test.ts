import type { ApiError } from '@rbp/api-client';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(email: string, locationId = 'loc_01MAIN') {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(locationId);
  useSessionStore.getState().setDevice(null);
}

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ApiError) => e,
  );

const onHand = async (productId: string, locationId: string) =>
  (await api.inventory.get(productId)).levels.find((l) => l.locationId === locationId)?.onHand ?? 0;

/** On hand must always equal the sum of the item's movements. */
async function ledgerTotal(productId: string, locationId: string) {
  const { items } = await api.stockMovements.list({ productId, locationId, pageSize: 100 });
  return items.reduce((s, m) => s + m.quantity, 0);
}

describe('mock purchasing: PUR-001/002 suppliers', () => {
  it('lists suppliers with derived open orders and value received', async () => {
    await signInAs('owner@pilot.demo');
    const { items } = await api.suppliers.list();
    const byCode = new Map(items.map((s) => [s.code, s]));
    // Perera: PO-000001 received (24×240 + 36×160), PO-000005 ordered; the draft doesn't count.
    expect(byCode.get('SUP-001')).toMatchObject({
      openOrders: 1,
      totalReceived: { amount: (24 * 240 + 36 * 160) * 100 },
    });
    expect(byCode.get('SUP-005')).toMatchObject({ isActive: false });
    expect((await api.suppliers.list({ active: false })).items.map((s) => s.code)).toEqual([
      'SUP-005',
    ]);
  });

  it('creates, edits and deactivates a supplier (audited, never deleted)', async () => {
    await signInAs('manager@pilot.demo');
    const created = await api.suppliers.create({
      name: 'Kandy Spice Traders',
      phone: '077 555 1234',
      paymentTermsDays: 7,
    });
    expect(created).toMatchObject({ code: 'SUP-006', phone: '+94775551234', isActive: true });
    expect(
      await fail(api.suppliers.create({ name: 'kandy spice traders', paymentTermsDays: 0 })),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });

    const updated = await api.suppliers.update(created.id, {
      name: 'Kandy Spice Traders',
      paymentTermsDays: 14,
      contactName: 'Ramesh',
    });
    expect(updated).toMatchObject({ paymentTermsDays: 14, contactName: 'Ramesh' });
    expect(updated.phone).toBeUndefined();

    await api.suppliers.setActive(created.id, false);
    // An inactive supplier can't take new orders.
    expect(
      await fail(
        api.purchaseOrders.create({
          supplierId: created.id,
          locationId: 'loc_01MAIN',
          lines: [{ productId: 'prd_01S01', quantity: 10, unitCost: 7500 }],
        }),
      ),
    ).toMatchObject({ code: 'CONFLICT' });
    const audit = await api.audit.list({ entity: 'supplier', entityId: created.id });
    expect(audit.items.map((e) => e.action)).toEqual([
      'purchasing.supplier.deactivate',
      'purchasing.supplier.update',
      'purchasing.supplier.create',
    ]);
  });
});

describe('mock purchasing: PUR-003/004 order → receive → stock', () => {
  it('receives a delivery in two parts, posting PURCHASE movements each time', async () => {
    await signInAs('manager@pilot.demo');
    const before = await onHand('prd_01S03', 'loc_01MAIN');
    const draft = await api.purchaseOrders.create({
      supplierId: 'sup_02',
      locationId: 'loc_01MAIN',
      expectedDate: '2030-01-15',
      lines: [
        { productId: 'prd_01S03', quantity: 30, unitCost: 9500 },
        { productId: 'prd_01S04', quantity: 20, unitCost: 4500 },
      ],
    });
    expect(draft).toMatchObject({
      number: 'PO-000007',
      status: 'DRAFT',
      total: { amount: 30 * 9500 + 20 * 4500 },
    });
    // A draft isn't with the supplier yet.
    expect(
      await fail(
        api.purchaseOrders.receive(draft.id, {
          lines: [{ productId: 'prd_01S03', receivedQuantity: 1 }],
        }),
      ),
    ).toMatchObject({ code: 'CONFLICT' });

    const placed = await api.purchaseOrders.place(draft.id);
    expect(placed.status).toBe('ORDERED');
    expect(
      await fail(api.purchaseOrders.update(draft.id, { ...draftBody(), place: false })),
    ).toMatchObject({ code: 'CONFLICT' });

    // More than ordered is refused.
    expect(
      await fail(
        api.purchaseOrders.receive(draft.id, {
          lines: [{ productId: 'prd_01S03', receivedQuantity: 31 }],
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });

    const first = await api.purchaseOrders.receive(draft.id, {
      lines: [
        { productId: 'prd_01S03', receivedQuantity: 30 },
        { productId: 'prd_01S04', receivedQuantity: 5 },
      ],
      supplierInvoiceRef: 'GRS-2001',
    });
    expect(first).toMatchObject({ number: 'GRN-000003', supplierInvoiceRef: 'GRS-2001' });
    expect(first.lines.find((l) => l.productId === 'prd_01S03')?.balanceAfter).toBe(before + 30);
    expect(await onHand('prd_01S03', 'loc_01MAIN')).toBe(before + 30);
    expect(await ledgerTotal('prd_01S03', 'loc_01MAIN')).toBe(before + 30);
    const [movement] = (await api.stockMovements.list({ productId: 'prd_01S03', type: 'PURCHASE' }))
      .items;
    expect(movement).toMatchObject({
      quantity: 30,
      reference: { kind: 'GOODS_RECEIPT', id: first.id, number: 'GRN-000003' },
    });
    expect((await api.purchaseOrders.get(draft.id)).status).toBe('PARTIALLY_RECEIVED');

    // Something has arrived: it can't be cancelled any more.
    expect(
      await fail(api.purchaseOrders.cancel(draft.id, { reason: 'Changed our mind' })),
    ).toMatchObject({ code: 'CONFLICT' });

    // Only the 15 still to come can be received.
    expect(
      await fail(
        api.purchaseOrders.receive(draft.id, {
          lines: [{ productId: 'prd_01S04', receivedQuantity: 16 }],
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
    await api.purchaseOrders.receive(draft.id, {
      lines: [{ productId: 'prd_01S04', receivedQuantity: 15 }],
    });
    const done = await api.purchaseOrders.get(draft.id);
    expect(done.status).toBe('RECEIVED');
    expect(done.receiptIds).toHaveLength(2);
    expect((await api.goodsReceipts.list({ purchaseOrderId: draft.id })).total).toBe(2);
  });

  it('cancels an order before delivery, with a reason', async () => {
    await signInAs('owner@pilot.demo');
    expect(await fail(api.purchaseOrders.cancel('po_seed_4', { reason: '' }))).toMatchObject({
      code: 'VALIDATION_FAILED',
    });
    const cancelled = await api.purchaseOrders.cancel('po_seed_4', {
      reason: 'Supplier closed for Poya',
    });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelledBy: 'Nirmala Rajan' });
  });

  it('keeps orders to the user’s locations and needs the feature and permission', async () => {
    // Manager works at Main + Bakery: Central Store orders are hidden.
    await signInAs('manager@pilot.demo');
    const { items } = await api.purchaseOrders.list({ pageSize: 100 });
    expect(items.some((p) => p.locationId === 'loc_01STORE')).toBe(false);
    expect(await fail(api.purchaseOrders.get('po_seed_1'))).toMatchObject({ code: 'FORBIDDEN' });

    await signInAs('cashier@pilot.demo');
    expect(await fail(api.suppliers.list())).toMatchObject({ code: 'FORBIDDEN' });

    await signInAs('owner@grocery.demo', 'loc_02TOWN');
    expect(await fail(api.suppliers.list())).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
  });
});

function draftBody() {
  return {
    supplierId: 'sup_02',
    locationId: 'loc_01MAIN',
    lines: [{ productId: 'prd_01S03', quantity: 1, unitCost: 100 }],
  };
}
