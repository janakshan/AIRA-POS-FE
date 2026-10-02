import type { ApiError } from '@rbp/api-client';
import type { SensitiveActionCode } from '@rbp/types';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(email: string) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(null);
}

const fail = (p: Promise<unknown>) =>
  p.then(
    () => null,
    (e: ApiError) => e,
  );

describe('mock customers API (POS-003)', () => {
  it.each(['0771234567', '077 123 4567', '+94 77 123 4567', '771234567'])(
    'finds a customer by phone typed as %s',
    async (phone) => {
      await signInAs('cashier@pilot.demo');
      const result = await api.customers.list({ phone });
      expect(result.items.map((c) => c.name)).toEqual(['Nimal Perera']);
      expect(result.items[0]!.outstanding.amount).toBe(250000);
    },
  );

  it('returns no match for an unknown or invalid phone', async () => {
    await signInAs('cashier@pilot.demo');
    expect((await api.customers.list({ phone: '0779999999' })).items).toEqual([]);
    expect((await api.customers.list({ phone: '12' })).items).toEqual([]);
  });

  it('searches by name or phone digits, per tenant', async () => {
    await signInAs('cashier@pilot.demo');
    expect((await api.customers.list({ search: 'kavi' })).items.map((c) => c.id)).toEqual([
      'cus_02',
    ]);
    // Secondary (home) phone matches too, typed in local form.
    expect((await api.customers.list({ search: '0112345' })).items.map((c) => c.id)).toEqual([
      'cus_02',
    ]);
    const page = await api.customers.list({ pageSize: 4 });
    expect(page).toMatchObject({ total: 10, pageSize: 4 });

    await signInAs('owner@grocery.demo');
    const grocery = await api.customers.list({ phone: '0771234567' });
    expect(grocery.items.map((c) => c.id)).toEqual(['cus_21']);
    expect(await fail(api.customers.get('cus_01'))).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('quick-creates a customer with a normalized phone and audits it', async () => {
    await signInAs('cashier@pilot.demo');
    const created = await api.customers.create({ name: '  Janani R  ', phone: '078 555 1234' });
    expect(created).toMatchObject({
      name: 'Janani R',
      type: 'RETAIL',
      phones: [{ number: '+94785551234', primary: true }],
      outstanding: { amount: 0 },
    });
    expect((await api.customers.list({ phone: '0785551234' })).items[0]!.id).toBe(created.id);

    await signInAs('owner@pilot.demo');
    const [event] = (await api.audit.list({ entity: 'customer' })).items;
    expect(event).toMatchObject({ action: 'customer.create', userName: 'Fathima Rizvi' });
  });

  it('rejects a phone that already belongs to a customer, pointing at them', async () => {
    await signInAs('cashier@pilot.demo');
    const error = await fail(api.customers.create({ name: 'Someone', phone: '+94771234567' }));
    expect(error).toMatchObject({
      code: 'CONFLICT',
      status: 409,
      details: { customerId: 'cus_01', fieldErrors: { phone: 'validation.phoneTaken' } },
    });
    const invalid = await fail(api.customers.create({ name: 'X', phone: '123' }));
    expect(invalid!.details!.fieldErrors).toEqual({
      name: 'validation.nameMin',
      phone: 'validation.phoneInvalid',
    });
  });

  it('lets waiters look up and quick-create customers, but not edit them', async () => {
    await signInAs('waiter@pilot.demo');
    expect((await api.customers.list({ phone: '0771234567' })).total).toBe(1);
    const created = await api.customers.create({ name: 'Walk In', phone: '0785550000' });
    expect(created).toMatchObject({ name: 'Walk In', phones: [{ number: '+94785550000' }] });
    expect(await fail(api.customers.update(created.id, { name: 'Changed' }))).toMatchObject({
      code: 'FORBIDDEN',
      details: { permission: 'customer.manage' },
    });

    // Staff who can't sell or manage customers still can't create them.
    await signInAs('kitchen@pilot.demo');
    expect(await fail(api.customers.create({ name: 'Cook', phone: '0785550001' }))).toMatchObject({
      code: 'FORBIDDEN',
      details: { permission: 'customer.manage' },
    });
  });
});

async function signInAt(email: string, deviceId: string | null = 'dev_01') {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation('loc_01MAIN');
  useSessionStore.getState().setDevice(deviceId);
}

async function pin(code: string, action: SensitiveActionCode, reasonCode = 'MANAGER_INSTRUCTION') {
  const { verificationId } = await api.identity.verifyEmployee({ pin: code, action });
  return { verificationId, reasonCode };
}

const lkr = (rupees: number) => ({ amount: Math.round(rupees * 100), currency: 'LKR' as const });

describe('mock customers API (CUS-001…005)', () => {
  it('filters by type and balance, sorts, and sums what is owed', async () => {
    await signInAs('manager@pilot.demo');
    const owing = await api.customers.list({ owes: true, sort: 'outstanding' });
    expect(owing.items.map((c) => [c.name, c.outstanding.amount])).toEqual([
      ['Colombo Tech Park Canteen', 1875000],
      ['Nimal Perera', 250000],
      ['Anjali Kumari', 85000],
    ]);
    expect(owing.summary).toEqual({ totalOutstanding: lkr(22100), owingCount: 3 });
    expect((await api.customers.list({ type: 'CORPORATE' })).items.map((c) => c.name)).toEqual([
      'Colombo Tech Park Canteen',
    ]);
    // Most recent buyer first.
    expect((await api.customers.list({ sort: 'lastOrder' })).items[0]?.name).toBe(
      'Kavitha Sivakumar',
    );
  });

  it('creates and edits a full record with several phones (CUS-002)', async () => {
    await signInAs('manager@pilot.demo');
    const created = await api.customers.create({
      name: 'Harini Mohan',
      type: 'REGULAR',
      phones: [
        { number: '078 111 2233', label: 'Home', primary: false },
        { number: '0781112234', primary: true },
      ],
      address: '3 Sea Street, Colombo 11',
      deliveryAddress: '  ',
      notes: 'Allergic to nuts',
    });
    expect(created).toMatchObject({
      type: 'REGULAR',
      phones: [
        { number: '+94781112234', primary: true },
        { number: '+94781112233', primary: false, label: 'Home' },
      ],
      address: '3 Sea Street, Colombo 11',
      notes: 'Allergic to nuts',
    });
    expect(created).not.toHaveProperty('deliveryAddress');
    // Both numbers find her.
    expect((await api.customers.list({ phone: '0781112233' })).items[0]?.id).toBe(created.id);

    // A number twice, no primary, or another customer's number are refused.
    expect(
      await fail(
        api.customers.create({
          name: 'Twice',
          type: 'RETAIL',
          phones: [
            { number: '0785550010', primary: true },
            { number: '+94785550010', primary: false },
          ],
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(
      await fail(
        api.customers.update(created.id, {
          phones: [
            { number: '0781112234', primary: true },
            { number: '0771234567', primary: false },
          ],
        }),
      ),
    ).toMatchObject({
      code: 'CONFLICT',
      details: {
        customerName: 'Nimal Perera',
        fieldErrors: { 'phones.1.number': 'validation.phoneTaken' },
      },
    });

    const edited = await api.customers.update(created.id, {
      phones: [{ number: '0781112233', label: 'Mobile', primary: true }],
      address: '',
      deliveryAddress: '9 Beach Road, Negombo',
    });
    expect(edited.phones).toEqual([{ number: '+94781112233', label: 'Mobile', primary: true }]);
    expect(edited).not.toHaveProperty('address');
    expect(edited.deliveryAddress).toBe('9 Beach Road, Negombo');
    // The dropped number is free again.
    expect((await api.customers.list({ phone: '0781112234' })).total).toBe(0);

    // Waiters can quick-create but not use the full form.
    await signInAs('waiter@pilot.demo');
    expect(
      await fail(
        api.customers.create({
          name: 'Full Form',
          type: 'RETAIL',
          phones: [{ number: '0785550011', primary: true }],
        }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('shows purchase stats and orders from every location (CUS-003/004)', async () => {
    await signInAs('manager@pilot.demo');
    const nimal = await api.customers.get('cus_01');
    expect(nimal.stats.orderCount).toBe(3);
    expect(nimal.stats.totalSpent.amount).toBeGreaterThan(0);
    expect(nimal.stats.averageOrder.amount).toBe(Math.round(nimal.stats.totalSpent.amount / 3));
    const orders = await api.customers.orders('cus_01');
    expect(orders.total).toBe(3);
    expect(new Set(orders.items.map((o) => o.locationId))).toEqual(
      new Set(['loc_01MAIN', 'loc_01BAKERY']),
    );
    expect(orders.items.every((o) => o.number.startsWith('OLD-'))).toBe(true);
    // Newest first.
    const dates = orders.items.map((o) => o.paidAt!);
    expect([...dates].sort().reverse()).toEqual(dates);
    expect((await api.customers.orders('cus_01', { status: 'VOIDED' })).total).toBe(0);
  });

  it('keeps a statement whose running balance matches what is owed (CUS-005)', async () => {
    await signInAs('manager@pilot.demo');
    const seeded = await api.customers.ledger('cus_09');
    expect(seeded.map((e) => e.kind)).toEqual(['OPENING', 'CREDIT_SALE', 'CREDIT_SALE']);
    expect(seeded.at(-1)?.balance).toEqual(lkr(18750));

    // New credit sale, part return, and a voided credit sale.
    await signInAt('cashier@pilot.demo');
    const sale = await api.orders.create({
      lines: [{ productId: 'prd_01K01', quantity: 2 }],
      adjustmentIds: [],
      status: 'OPEN',
      customerId: 'cus_09',
    });
    const paid = await api.orders.pay(sale.id, { method: 'CREDIT' });
    await api.orders.createReturn(paid.id, {
      lines: [{ lineId: paid.lines[0]!.id, quantity: 1 }],
      refundMethod: 'ORIGINAL',
      verification: await pin('2222', 'pos.return', 'CUSTOMER_RETURNED'),
    });
    const second = await api.orders.pay(
      (
        await api.orders.create({
          lines: [{ productId: 'prd_01S01', quantity: 5 }],
          adjustmentIds: [],
          status: 'OPEN',
          customerId: 'cus_09',
        })
      ).id,
      { method: 'CREDIT' },
    );
    await api.orders.void(second.id, {
      verification: await pin('2222', 'pos.invoice.void', 'WRONG_ITEM_SOLD'),
    });

    const ledger = await api.customers.ledger('cus_09');
    expect(ledger.slice(3).map((e) => e.kind)).toEqual([
      'CREDIT_SALE',
      'RETURN',
      'CREDIT_SALE',
      'VOID',
    ]);
    expect(ledger.find((e) => e.kind === 'RETURN')?.reference).toMatch(/^RTN-MAIN-/);
    const customer = await api.customers.get('cus_09');
    expect(ledger.at(-1)?.balance).toEqual(customer.outstanding);
  });

  it('receives payments on account within what is owed, audited', async () => {
    await signInAt('waiter@pilot.demo');
    expect(
      await fail(api.customers.receivePayment('cus_01', { amount: lkr(500), method: 'CASH' })),
    ).toMatchObject({ code: 'FORBIDDEN' });

    await signInAt('cashier@pilot.demo');
    expect(
      await fail(api.customers.receivePayment('cus_01', { amount: lkr(3000), method: 'CASH' })),
    ).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fieldErrors: { amount: 'validation.amountTooHigh' } },
    });
    expect(
      await fail(
        api.customers.receivePayment('cus_01', { amount: lkr(500), method: 'BANK_TRANSFER' }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });

    const { payment, customer } = await api.customers.receivePayment('cus_01', {
      amount: lkr(1000),
      method: 'CASH',
    });
    expect(payment).toMatchObject({
      number: 'PAY-000001',
      amount: lkr(1000),
      receivedBy: 'Fathima Rizvi',
      locationId: 'loc_01MAIN',
    });
    expect(customer.outstanding).toEqual(lkr(1500));
    const ledger = await api.customers.ledger('cus_01');
    expect(ledger.at(-1)).toMatchObject({
      kind: 'PAYMENT',
      reference: 'PAY-000001',
      amount: lkr(-1000),
      balance: lkr(1500),
    });
    // Settle the rest.
    await api.customers.receivePayment('cus_01', {
      amount: lkr(1500),
      method: 'BANK_TRANSFER',
      reference: 'BOC-7781',
    });
    expect((await api.customers.get('cus_01')).outstanding.amount).toBe(0);

    await signInAs('owner@pilot.demo');
    const [event] = (await api.audit.list({ action: 'customer.payment' })).items;
    expect(event?.entityLabel).toContain('PAY-000002 · Nimal Perera · BANK TRANSFER');
  });
});
