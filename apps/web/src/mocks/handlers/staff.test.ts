import type { ApiError } from '@rbp/api-client';
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

async function mealPin(code = '2222', reasonCode = 'MEAL_BREAK') {
  const { verificationId } = await api.identity.verifyEmployee({ pin: code, action: 'staff.meal' });
  return { verificationId, reasonCode };
}

const MAIN = 'loc_01MAIN';
const KASUN = 'emp_04';
const ARUN = 'emp_05';
const onHand = async (productId: string) =>
  (await api.inventory.get(productId)).levels.find((l) => l.locationId === MAIN)!.onHand;
const ingredient = async (id: string) =>
  (await api.ingredients.list({ locationId: MAIN })).find((i) => i.id === id)!.levels[0]!.onHand;
const allowanceOf = async (id: string) =>
  (await api.staff.allowance()).rows.find((r) => r.employeeId === id)!;

describe('mock staff: HR-005/006 staff meals and the food allowance (§22, §23)', () => {
  it('seeds one employee within and one over the Rs 5,000 allowance', async () => {
    await signInAs('manager@pilot.demo');
    const arun = await allowanceOf(ARUN);
    expect(arun).toMatchObject({ allowance: { amount: 500_000 }, excess: { amount: 0 } });
    expect(arun.consumed.amount).toBeLessThan(500_000);
    const kasun = await allowanceOf(KASUN);
    expect(kasun.excess.amount).toBe(kasun.consumed.amount - 500_000);
    expect(kasun.excess.amount).toBeGreaterThan(0);
  });

  it('moves stock with no payment and counts against the allowance', async () => {
    await signInAs('manager@pilot.demo');
    const veg = await ingredient('ing_01VEG');
    const tea = await onHand('prd_01D02');
    const before = await allowanceOf(ARUN);
    const orders = (await api.orders.list({ pageSize: 100 })).total;

    const meal = await api.staff.meals.create({
      employeeId: ARUN,
      lines: [
        { productId: 'prd_01R02', quantity: 1 },
        { productId: 'prd_01D02', quantity: 2 },
      ],
      verification: await mealPin(),
    });
    expect(meal).toMatchObject({ employeeName: 'Arun Selvam', approvedBy: 'Suresh Kumar' });
    // Recipe dish: its ingredients (Vegetable Rice & Curry uses 2 veg); other items: STAFF_MEAL.
    expect(await ingredient('ing_01VEG')).toBe(veg - 2);
    expect(await onHand('prd_01D02')).toBe(tea - 2);
    const [movement] = (await api.stockMovements.list({ productId: 'prd_01D02', locationId: MAIN }))
      .items;
    expect(movement).toMatchObject({
      type: 'STAFF_MEAL',
      quantity: -2,
      reference: { kind: 'STAFF_MEAL', number: meal.number },
    });
    // No sale, no payment.
    expect((await api.orders.list({ pageSize: 100 })).total).toBe(orders);
    // Over the allowance → the excess is what goes to payroll.
    const after = await allowanceOf(ARUN);
    expect(after.consumed.amount).toBe(before.consumed.amount + meal.value.amount);
    expect(after.excess.amount).toBe(Math.max(0, after.consumed.amount - 500_000));
  });

  it('needs an approver PIN, stock, and an employee who works here', async () => {
    await signInAs('cashier@pilot.demo');
    // A cashier can ring it up, but a manager approves.
    const cashierPin = await fail(
      api.identity.verifyEmployee({ pin: '3333', action: 'staff.meal' }),
    );
    expect(cashierPin).toMatchObject({ code: 'EMPLOYEE_NOT_AUTHORIZED' });
    expect(
      await fail(
        api.staff.meals.create({
          employeeId: KASUN,
          lines: [{ productId: 'prd_01S02', quantity: 1 }],
          verification: await mealPin(),
        }),
      ),
    ).toMatchObject({ status: 409 }); // Vegetable Roti is out of stock.
    expect(
      await fail(
        api.staff.meals.create({
          employeeId: 'emp_06',
          lines: [{ productId: 'prd_01D02', quantity: 1 }],
          verification: await mealPin(),
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' }); // Priya works at the Bakery.
  });
});

describe('mock staff: HR-003 attendance with a PIN', () => {
  it('clocks in and out, and shows late and absent against the roster', async () => {
    await signInAs('cashier@pilot.demo');
    const kasunIn = await api.staff.attendance.clock({ pin: '4444' });
    expect(kasunIn).toMatchObject({ action: 'OUT', employee: { fullName: 'Kasun Perera' } });
    const back = await api.staff.attendance.clock({ pin: '4444' });
    expect(back.action).toBe('IN');
    expect(await fail(api.staff.attendance.clock({ pin: '9999' }))).toMatchObject({
      code: 'INVALID_PIN',
    });
    // Priya (Bakery) can't clock in at Main.
    expect(await fail(api.staff.attendance.clock({ pin: '6666' }))).toMatchObject({
      code: 'EMPLOYEE_WRONG_LOCATION',
      status: 403,
      details: { employeeName: 'Priya Nathan', location: 'Main Restaurant' },
    });

    await signInAs('manager@pilot.demo');
    const days = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() - n);
      const p = (x: number) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
    };
    const twoDaysAgo = await api.staff.attendance.day({ date: days(2), locationId: MAIN });
    const threeDaysAgo = await api.staff.attendance.day({ date: days(3), locationId: MAIN });
    const fathima2 = twoDaysAgo.find((r) => r.employeeId === 'emp_03')!;
    const arun3 = threeDaysAgo.find((r) => r.employeeId === ARUN)!;
    // Sundays are off; otherwise the seeded late/absent show.
    if (fathima2.shift) expect(fathima2).toMatchObject({ status: 'LATE', lateBy: 25 });
    if (arun3.shift) expect(arun3.status).toBe('ABSENT');
    const today = await api.staff.attendance.day({ locationId: MAIN });
    expect(today.find((r) => r.employeeId === KASUN)?.inNow).toBe(true);
  });

  it('lets a manager roster a shift', async () => {
    await signInAs('manager@pilot.demo');
    const week = await api.staff.roster.get(MAIN, new Date().toISOString().slice(0, 10));
    expect(week.templates.map((t) => t.name)).toEqual(['Morning', 'Evening']);
    const day = week.days[6]!;
    const updated = await api.staff.roster.assign({
      locationId: MAIN,
      employeeId: 'emp_03',
      date: day,
      templateId: 'tpl_EVENING',
    });
    expect(updated.assignments).toContainEqual({
      employeeId: 'emp_03',
      date: day,
      templateId: 'tpl_EVENING',
    });
    await signInAs('cashier@pilot.demo');
    expect(
      await fail(
        api.staff.roster.assign({
          locationId: MAIN,
          employeeId: 'emp_03',
          date: day,
          templateId: null,
        }),
      ),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('mock staff: HR-004 cash drawer shift (SCN-005 handover)', () => {
  it('works out expected cash, closes with a variance, and hands over', async () => {
    await signInAs('cashier@pilot.demo');
    const history = await api.staff.cashShifts.list(MAIN);
    // Newest first: today's open shift, then yesterday's (Rs 200 short).
    expect(history[1]?.variance?.amount).toBe(-20_000);

    const current = (await api.staff.cashShifts.current())!;
    expect(current).toMatchObject({ status: 'OPEN', openingFloat: { amount: 330_000 } });
    // A cash sale on this till adds to expected cash.
    const order = await api.orders.create({
      lines: [{ productId: 'prd_01D02', quantity: 1 }],
      adjustmentIds: [],
      status: 'OPEN',
    });
    await api.orders.pay(order.id, {
      method: 'CASH',
      tendered: { amount: order.totals.total.amount, currency: 'LKR' },
    });
    const withSale = await api.staff.cashShifts.event(current.id, {
      type: 'CASH_OUT',
      amount: 50_000,
      note: 'Bought gas cylinder',
    });
    expect(withSale.expectedCash.amount).toBe(330_000 + order.totals.total.amount - 50_000);
    // Can't take out more than the drawer holds (taking it all is fine).
    expect(
      await fail(
        api.staff.cashShifts.event(current.id, {
          type: 'CASH_OUT',
          amount: withSale.expectedCash.amount + 1,
          note: 'Too much',
        }),
      ),
    ).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: {
        reason: 'CASH_OUT_EXCEEDS_DRAWER',
        fieldErrors: { amount: 'validation.moreThanInDrawer' },
      },
    });
    expect((await api.staff.cashShifts.current())!.expectedCash.amount).toBe(
      withSale.expectedCash.amount,
    );

    expect(await fail(api.staff.cashShifts.open({ pin: '3333', openingFloat: 0 }))).toMatchObject({
      code: 'CONFLICT',
    });
    const closed = await api.staff.cashShifts.close(current.id, {
      pin: '3333',
      countedCash: withSale.expectedCash.amount - 10_000,
    });
    expect(closed).toMatchObject({ status: 'CLOSED', variance: { amount: -10_000 } });
    // The next person opens with the count.
    const next = await api.staff.cashShifts.open({
      pin: '2222',
      openingFloat: closed.countedCash!.amount,
    });
    expect(next).toMatchObject({ status: 'OPEN', openedBy: { name: 'Suresh Kumar' } });
    // A waiter can't count the drawer.
    expect(
      await fail(api.staff.cashShifts.close(next.id, { pin: '4444', countedCash: 0 })),
    ).toMatchObject({ code: 'EMPLOYEE_NOT_AUTHORIZED' });
  });
});

describe('mock staff: access', () => {
  it('is gated by HR/ATTENDANCE and staff permissions', async () => {
    await signInAs('owner@grocery.demo', 'loc_02TOWN', 'dev_06');
    expect(await fail(api.staff.employees.list())).toMatchObject({ code: 'FEATURE_NOT_ENABLED' });
    await signInAs('cashier@pilot.demo');
    expect(await fail(api.staff.employees.list())).toMatchObject({ code: 'FORBIDDEN' });
    expect(await fail(api.staff.allowance())).toMatchObject({ code: 'FORBIDDEN' });
    await signInAs('manager@pilot.demo');
    const list = await api.staff.employees.list();
    expect(list.find((e) => e.id === KASUN)).toMatchObject({
      clockedIn: { locationId: MAIN, locationName: 'Main Restaurant' },
      login: { email: 'waiter@pilot.demo' },
    });
    // Names come with the employee, even for a location the manager can't open.
    expect((await api.staff.employees.get('emp_01')).locations.map((l) => l.name)).toEqual([
      'Main Restaurant',
      'Bakery Outlet',
      'Central Store',
    ]);
    expect(list.some((e) => 'pin' in e)).toBe(false);
    const created = await api.staff.employees.create({
      fullName: 'Nadeesha Perera',
      jobTitle: 'Cashier',
      phone: '0771112233',
      locationIds: [MAIN],
      pin: '4321',
      monthlyFoodAllowance: 400_000,
    });
    expect(created).toMatchObject({ code: 'E009', phone: '+94771112233', login: null });
    expect(
      await fail(
        api.staff.employees.create({
          fullName: 'Duplicate Pin',
          jobTitle: 'Waiter',
          locationIds: [MAIN],
          pin: '4321',
          monthlyFoodAllowance: 0,
        }),
      ),
    ).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it("lets a manager edit someone who also works where the manager can't go", async () => {
    await signInAs('manager@pilot.demo');
    const STORE = 'loc_01STORE';
    const nirmala = await api.staff.employees.get('emp_01');
    const body = {
      fullName: nirmala.fullName,
      jobTitle: 'Owner & Director',
      locationIds: nirmala.locationIds,
      monthlyFoodAllowance: nirmala.monthlyFoodAllowance?.amount ?? 0,
    };
    // Central Store comes back unchanged: allowed, and kept.
    expect(await api.staff.employees.update('emp_01', body)).toMatchObject({
      jobTitle: 'Owner & Director',
      locationIds: expect.arrayContaining([STORE]),
    });
    // Dropping a visible location is fine; removing or adding Central Store is not.
    expect(
      (
        await api.staff.employees.update('emp_01', {
          ...body,
          locationIds: nirmala.locationIds.filter((l) => l !== 'loc_01BAKERY'),
        })
      ).locationIds,
    ).toEqual([MAIN, STORE]);
    expect(
      await fail(api.staff.employees.update('emp_01', { ...body, locationIds: [MAIN] })),
    ).toMatchObject({ code: 'FORBIDDEN' });
    expect(
      await fail(api.staff.employees.update(KASUN, { ...body, locationIds: [MAIN, STORE] })),
    ).toMatchObject({ code: 'FORBIDDEN' });
  });
});
