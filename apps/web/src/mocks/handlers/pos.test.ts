import type { ApiError } from '@rbp/api-client';
import {
  PERMISSIONS,
  SENSITIVE_ACTION_CODES,
  SENSITIVE_ACTIONS,
  type SensitiveActionCode,
} from '@rbp/types';
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

async function pin(
  code: string,
  action: SensitiveActionCode = 'pos.discount.apply',
  reasonCode = 'MANAGER_INSTRUCTION',
) {
  const { verificationId } = await api.identity.verifyEmployee({ pin: code, action });
  return { verificationId, reasonCode };
}

const billDiscount = { kind: 'DISCOUNT', scope: 'ORDER', mode: 'PERCENT', value: 1000 } as const;

describe('mock sale adjustments (POS-004 / POS-005)', () => {
  it('serves charge types per location and promotions per tenant', async () => {
    await signInAs('cashier@pilot.demo');
    expect((await api.pos.chargeTypes()).map((c) => c.code)).toEqual([
      'SERVICE',
      'DELIVERY',
      'PACKAGING',
      'OTHER',
    ]);
    expect((await api.pos.promotions()).map((p) => p.code)).toEqual([
      'LOYALTY100',
      'HAPPYHOUR',
      'STAFF20',
    ]);
    await signInAs('cashier@grocery.demo', 'loc_02TOWN', null);
    expect((await api.pos.chargeTypes()).map((c) => c.code)).toEqual(['DELIVERY', 'OTHER']);
  });

  it('requires a manager PIN and a reason for any discount, and audits it', async () => {
    await signInAs('cashier@pilot.demo');
    expect(await fail(api.pos.adjustments.create(billDiscount))).toMatchObject({
      code: 'VERIFICATION_REQUIRED',
    });
    // The cashier's own PIN is refused at the PIN step: she lacks pos.discount.apply (SCN-006).
    expect(await fail(pin('3333'))).toMatchObject({
      code: 'EMPLOYEE_NOT_AUTHORIZED',
      details: { employee: 'Fathima Rizvi', permission: 'pos.discount.apply' },
    });

    const created = await api.pos.adjustments.create({
      ...billDiscount,
      verification: await pin('2222'),
    });
    expect(created).toMatchObject({
      status: 'ACTIVE',
      label: '10% discount',
      approvedBy: { fullName: 'Suresh Kumar' },
      reason: { code: 'MANAGER_INSTRUCTION' },
      createdBy: 'Fathima Rizvi',
      deviceId: 'dev_01',
    });

    await signInAs('owner@pilot.demo');
    const [event] = (await api.audit.list({ entity: 'sale-adjustment' })).items;
    expect(event).toMatchObject({
      action: 'pos.discount.apply',
      entityLabel: 'Bill: 10% discount · 10% · Main Restaurant · Counter POS 1',
      employee: { fullName: 'Suresh Kumar' },
      reason: { label: 'Manager instruction' },
    });
  });

  it('enforces the location discount limit and takes promotion values from the server', async () => {
    await signInAs('manager@pilot.demo');
    const over = await fail(
      api.pos.adjustments.create({ ...billDiscount, value: 6000, verification: await pin('2222') }),
    );
    expect(over).toMatchObject({ code: 'VALIDATION_FAILED', details: { maxBps: 5000 } });

    const promo = await api.pos.adjustments.create({
      kind: 'DISCOUNT',
      scope: 'LINE',
      productId: 'prd_01S01',
      promotionCode: 'STAFF20',
      mode: 'PERCENT',
      value: 9999, // ignored: the server uses the promotion's own value
      verification: await pin('2222'),
    });
    expect(promo).toMatchObject({ mode: 'PERCENT', value: 2000, label: 'Staff 20%' });

    // A line promotion can't be used on the whole bill.
    expect(
      await fail(
        api.pos.adjustments.create({
          kind: 'DISCOUNT',
          scope: 'ORDER',
          promotionCode: 'STAFF20',
          verification: await pin('2222'),
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('adds default charges without a PIN but needs one for custom amounts and service changes', async () => {
    await signInAs('cashier@pilot.demo');
    const delivery = await api.pos.adjustments.create({
      kind: 'CHARGE',
      scope: 'ORDER',
      chargeCode: 'DELIVERY',
      mode: 'FIXED',
      value: 25000,
    });
    expect(delivery).toMatchObject({ label: 'Delivery', approvedBy: null });

    for (const body of [
      { chargeCode: 'DELIVERY', mode: 'FIXED', value: 40000 },
      { chargeCode: 'SERVICE', mode: 'PERCENT', value: 0 },
      { chargeCode: 'OTHER', mode: 'FIXED', value: 10000, label: 'Corkage' },
    ] as const) {
      expect(
        await fail(api.pos.adjustments.create({ kind: 'CHARGE', scope: 'ORDER', ...body })),
      ).toMatchObject({
        code: 'VERIFICATION_REQUIRED',
        details: { permission: 'pos.charge.manage' },
      });
    }

    const waived = await api.pos.adjustments.create({
      kind: 'CHARGE',
      scope: 'ORDER',
      chargeCode: 'SERVICE',
      mode: 'PERCENT',
      value: 0,
      verification: await pin('2222', 'pos.charge.manage'),
    });
    expect(waived).toMatchObject({ label: 'Service charge', value: 0 });

    // Bakery doesn't offer delivery.
    await signInAs('manager@pilot.demo', 'loc_01BAKERY', null);
    expect(
      await fail(
        api.pos.adjustments.create({
          kind: 'CHARGE',
          scope: 'ORDER',
          chargeCode: 'DELIVERY',
          mode: 'FIXED',
          value: 25000,
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('voids instead of deleting: discounts freely, charges with a PIN, never twice', async () => {
    await signInAs('cashier@pilot.demo');
    const discount = await api.pos.adjustments.create({
      ...billDiscount,
      verification: await pin('2222'),
    });
    const packaging = await api.pos.adjustments.create({
      kind: 'CHARGE',
      scope: 'ORDER',
      chargeCode: 'PACKAGING',
      mode: 'FIXED',
      value: 5000,
    });

    expect(await api.pos.adjustments.void(discount.id)).toMatchObject({ status: 'VOIDED' });
    expect(await fail(api.pos.adjustments.void(discount.id))).toMatchObject({ code: 'CONFLICT' });

    expect(await fail(api.pos.adjustments.void(packaging.id))).toMatchObject({
      code: 'VERIFICATION_REQUIRED',
    });
    const voided = await api.pos.adjustments.void(packaging.id, {
      verification: await pin('2222', 'pos.charge.manage'),
    });
    expect(voided.status).toBe('VOIDED');

    // Clearing a sale voids its adjustments without a PIN.
    const again = await api.pos.adjustments.create({
      kind: 'CHARGE',
      scope: 'ORDER',
      chargeCode: 'PACKAGING',
      mode: 'FIXED',
      value: 5000,
    });
    await api.pos.adjustments.void(again.id, { system: 'SALE_CLEARED' });

    await signInAs('owner@pilot.demo');
    const events = (await api.audit.list({ action: 'pos.adjustment.void' })).items;
    expect(events.map((e) => e.entityLabel)).toEqual([
      'Removed Packaging · sale cleared · Main Restaurant · Counter POS 1',
      'Removed Packaging · Main Restaurant · Counter POS 1',
      'Removed 10% discount · Main Restaurant · Counter POS 1',
    ]);
    expect(events[1]!.employee?.fullName).toBe('Suresh Kumar');
  });
});

describe('sensitive actions: POS-006 PIN → POS-007 reason', () => {
  it('maps every sensitive action to a real permission the seeded roles hold as intended', async () => {
    for (const code of SENSITIVE_ACTION_CODES) {
      expect(PERMISSIONS).toContain(SENSITIVE_ACTIONS[code].permission);
    }
    const perms = (email: string) =>
      api.auth
        .login({ email, password: 'demo1234' })
        .then(({ accessToken }) => useSessionStore.getState().signIn(accessToken))
        .then(() => api.identity.me())
        .then((me) => new Set(me.permissions));
    const cashier = await perms('cashier@pilot.demo');
    const manager = await perms('manager@pilot.demo');
    for (const code of [
      'pos.item.remove',
      'pos.order.cancel',
      'pos.refund',
      'pos.discount.apply',
    ] as const) {
      expect(cashier.has(SENSITIVE_ACTIONS[code].permission)).toBe(false);
      expect(manager.has(SENSITIVE_ACTIONS[code].permission)).toBe(true);
    }
  });

  it('rejects unknown actions and refuses the wrong person at PIN time without counting a failure', async () => {
    await signInAs('cashier@pilot.demo');
    expect(
      await fail(
        api.identity.verifyEmployee({ pin: '3333', action: 'nope' as SensitiveActionCode }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
    for (let i = 0; i < 6; i++) {
      expect(await fail(pin('3333', 'pos.refund'))).toMatchObject({
        code: 'EMPLOYEE_NOT_AUTHORIZED',
      });
    }
    // Six refusals didn't lock the terminal: a manager can still approve.
    expect((await pin('2222', 'pos.refund')).verificationId).toBeTruthy();
  });

  it('binds a verification to its action and allows it once', async () => {
    await signInAs('cashier@pilot.demo');
    const forRefund = await pin('2222', 'pos.refund');
    expect(
      await fail(api.pos.adjustments.create({ ...billDiscount, verification: forRefund })),
    ).toMatchObject({ code: 'VERIFICATION_REQUIRED', details: { reason: 'ACTION_MISMATCH' } });

    const forDiscount = await pin('2222');
    await api.pos.adjustments.create({ ...billDiscount, verification: forDiscount });
    expect(
      await fail(api.pos.adjustments.create({ ...billDiscount, verification: forDiscount })),
    ).toMatchObject({ code: 'VERIFICATION_REQUIRED' });
  });

  it('offers and accepts only the reasons configured for the action', async () => {
    await signInAs('cashier@pilot.demo');
    const drawer = (await api.reasons.list('pos.drawer.open')).map((r) => r.code);
    expect(drawer).toEqual([
      'CHANGE_FOR_CUSTOMER',
      'CASH_PICKUP',
      'SHIFT_COUNT',
      'MANAGER_INSTRUCTION',
      'OTHER',
    ]);
    const discount = (await api.reasons.list('pos.discount.apply')).map((r) => r.code);
    expect(discount).toContain('LOYAL_CUSTOMER');
    expect(discount).not.toContain('CASH_PICKUP');

    expect(
      await fail(
        api.pos.adjustments.create({
          ...billDiscount,
          verification: await pin('2222', 'pos.discount.apply', 'CASH_PICKUP'),
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('audits drawer openings with the employee and reason', async () => {
    await signInAs('cashier@pilot.demo');
    expect(
      await fail(
        api.pos.openDrawer({ verification: { verificationId: 'x', reasonCode: 'OTHER' } }),
      ),
    ).toMatchObject({
      code: 'VERIFICATION_REQUIRED',
    });
    // Cashiers may open the drawer themselves.
    await api.pos.openDrawer({
      verification: await pin('3333', 'pos.drawer.open', 'CHANGE_FOR_CUSTOMER'),
    });
    await signInAs('owner@pilot.demo');
    const [event] = (await api.audit.list({ action: 'pos.drawer.open' })).items;
    expect(event).toMatchObject({
      entityLabel: 'Cash drawer opened · Main Restaurant · Counter POS 1',
      employee: { fullName: 'Fathima Rizvi' },
      permission: 'pos.drawer.open',
      reason: { label: 'Change for customer' },
      locationName: 'Main Restaurant',
      deviceName: 'Counter POS 1',
    });
  });

  it('changes an item price at the POS with PIN + reason and records before → after', async () => {
    await signInAs('cashier@pilot.demo');
    const body = {
      kind: 'PRICE',
      scope: 'LINE',
      productId: 'prd_01D03',
      mode: 'FIXED',
      value: 35000,
    } as const;
    expect(await fail(api.pos.adjustments.create(body))).toMatchObject({
      code: 'VERIFICATION_REQUIRED',
    });
    const changed = await api.pos.adjustments.create({
      ...body,
      verification: await pin('2222', 'pos.price.override', 'PRICE_CORRECTION'),
    });
    // Iced Coffee is Rs 400 at Main (location price), now Rs 350.
    expect(changed).toMatchObject({ kind: 'PRICE', previousValue: 40000, value: 35000 });
    await signInAs('owner@pilot.demo');
    const [event] = (await api.audit.list({ action: 'pos.price.override' })).items;
    expect(event).toMatchObject({
      before: { unitPrice: { amount: 40000 } },
      after: { unitPrice: { amount: 35000 } },
      employee: { fullName: 'Suresh Kumar' },
    });
    // The summary reads old → new (was the new price twice).
    expect(event!.entityLabel).toMatch(/^Iced Coffee: Price LKR\s?400\.00 → LKR\s?350\.00 · /);

    // Undoing a price cut raises the price again → no PIN.
    await signInAs('cashier@pilot.demo');
    expect(await api.pos.adjustments.void(changed.id)).toMatchObject({ status: 'VOIDED' });
  });

  it('filters the audit trail by employee, sensitivity, time and text', async () => {
    // REP history seeds a month of audit events: look at this test's own.
    const from = new Date(Date.now() - 1000).toISOString();
    await signInAs('cashier@pilot.demo');
    await api.pos.adjustments.create({ ...billDiscount, verification: await pin('2222') });
    await api.pos.adjustments.create({
      kind: 'CHARGE',
      scope: 'ORDER',
      chargeCode: 'PACKAGING',
      mode: 'FIXED',
      value: 5000,
    });
    await signInAs('owner@pilot.demo');
    const all = await api.audit.list({ actionPrefix: 'pos.', from });
    expect(all.total).toBe(2);
    expect((await api.audit.list({ sensitive: true, from })).items.map((e) => e.action)).toEqual([
      'pos.discount.apply',
    ]);
    expect((await api.audit.list({ employeeId: 'emp_02', from })).total).toBe(1);
    expect((await api.audit.list({ search: 'packaging', from })).total).toBe(1);
    expect((await api.audit.list({ from: '2999-01-01T00:00:00.000Z' })).total).toBe(0);
    const employees = await api.employees.list();
    expect(employees.map((e) => e.fullName)).toContain('Suresh Kumar');
    expect(employees[0]).not.toHaveProperty('pin');
  });
});
