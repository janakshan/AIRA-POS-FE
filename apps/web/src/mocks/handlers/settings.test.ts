import type { ChargeSetting, LocationRequest, SettingsLocation } from '@rbp/types';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(
  email: string,
  locationId: string | null = 'loc_01MAIN',
  password = 'demo1234',
) {
  const { accessToken } = await api.auth.login({ email, password });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(locationId);
  useSessionStore.getState().setDevice(null);
}

const owner = () => signInAs('owner@pilot.demo');

const request = (l: SettingsLocation, patch: Partial<LocationRequest> = {}): LocationRequest => ({
  code: l.code,
  name: l.name,
  type: l.type,
  address: l.address,
  isActive: l.isActive,
  pos: l.pos,
  ...patch,
});

const newLocation: LocationRequest = {
  code: 'gal',
  name: 'Galle Road',
  type: 'RETAIL',
  address: '12 Galle Road, Colombo 3',
  pos: {
    taxLabel: 'VAT',
    taxRateBps: 1800,
    maxDiscountBps: 2000,
    returnWindowDays: 14,
    receiptFooter: 'Thanks!',
  },
};

describe('mock settings: access', () => {
  it('is closed to a manager', async () => {
    await signInAs('manager@pilot.demo');
    for (const call of [
      () => api.settings.charges.get('loc_01MAIN'),
      () => api.settings.locations.list(),
      () => api.settings.users.list(),
      () => api.settings.roles.list(),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 403 });
    }
  });
});

describe('mock settings: SET-007 charges', () => {
  it('sets the automatic service rate and hides charges a location does not offer', async () => {
    await owner();
    const { charges } = await api.settings.charges.get('loc_01MAIN');
    expect(charges.map((c) => [c.code, c.offered])).toEqual([
      ['SERVICE', true],
      ['DELIVERY', true],
      ['PACKAGING', true],
      ['OTHER', true],
    ]);
    const next: ChargeSetting[] = charges.map((c) =>
      c.code === 'SERVICE'
        ? { ...c, defaultValue: 1200 }
        : c.code === 'PACKAGING'
          ? { ...c, offered: false }
          : c,
    );
    await api.settings.charges.save('loc_01MAIN', { charges: next });

    expect((await api.pos.settings()).serviceChargeBps).toBe(1200);
    expect((await api.pos.chargeTypes()).map((c) => c.code)).toEqual([
      'SERVICE',
      'DELIVERY',
      'OTHER',
    ]);
    const [event] = (await api.audit.list()).items;
    expect(event).toMatchObject({
      action: 'settings.charges.update',
      entityLabel: 'Main Restaurant',
    });

    // Not automatic → no service on every sale.
    await api.settings.charges.save('loc_01MAIN', {
      charges: next.map((c) => (c.code === 'SERVICE' ? { ...c, automatic: false } : c)),
    });
    expect((await api.pos.settings()).serviceChargeBps).toBe(0);
  });

  it('rejects a fixed service charge and an automatic delivery charge', async () => {
    await owner();
    const { charges } = await api.settings.charges.get('loc_01MAIN');
    await expect(
      api.settings.charges.save('loc_01MAIN', {
        charges: charges.map((c) =>
          c.code === 'SERVICE'
            ? { ...c, mode: 'FIXED' as const }
            : c.code === 'DELIVERY'
              ? { ...c, automatic: true }
              : c,
        ),
      }),
    ).rejects.toMatchObject({
      status: 400,
      details: {
        fieldErrors: {
          'charges.0.mode': 'validation.servicePercent',
          'charges.1.automatic': 'validation.onlyServiceAutomatic',
        },
      },
    });
  });
});

describe('mock settings: SET-002 locations', () => {
  it('adds a location the owner can then open, with its own POS settings', async () => {
    await owner();
    const created = await api.settings.locations.create(newLocation);
    expect(created).toMatchObject({ code: 'GAL', isActive: true, userCount: 1 });
    const me = await api.identity.me();
    expect(me.locations.map((l) => l.id)).toContain(created.id);

    await signInAs('owner@pilot.demo', created.id);
    expect(await api.pos.settings()).toMatchObject({ taxRateBps: 1800, returnWindowDays: 14 });
    expect(await api.pos.chargeTypes()).toEqual([]);
  });

  it('refuses a duplicate code and going over the plan', async () => {
    await owner();
    await expect(
      api.settings.locations.create({ ...newLocation, code: 'main' }),
    ).rejects.toMatchObject({
      status: 409,
      details: { fieldErrors: { code: 'validation.codeTaken' } },
    });
    for (let i = 0; i < 6; i++) {
      await api.settings.locations.create({ ...newLocation, code: `X${i}`, name: `Extra ${i}` });
    }
    await expect(
      api.settings.locations.create({ ...newLocation, code: 'X9' }),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'LIMIT_REACHED', max: 10 } });
  });

  it('guards deactivation and drops inactive locations from sign-in', async () => {
    await owner();
    const list = await api.settings.locations.list();
    const main = list.find((l) => l.id === 'loc_01MAIN')!;
    const bakery = list.find((l) => l.id === 'loc_01BAKERY')!;
    await expect(
      api.settings.locations.update(main.id, request(main, { isActive: false })),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'CURRENT_LOCATION' } });

    await api.settings.locations.update(bakery.id, request(bakery, { isActive: false }));
    expect((await api.identity.me()).locations.map((l) => l.id)).not.toContain(bakery.id);
    // Still listed (and re-activatable) on SET-002.
    expect((await api.settings.locations.list()).find((l) => l.id === bakery.id)).toMatchObject({
      isActive: false,
    });
  });
});

describe('mock settings: SET-003 users', () => {
  it('creates a sign-in for an employee whose PIN then carries the role', async () => {
    // PINs are matched at the employee's own location.
    await signInAs('owner@pilot.demo', 'loc_01BAKERY');
    // Priya has no sign-in, so her PIN can't approve anything yet.
    await expect(
      api.identity.verifyEmployee({ pin: '6666', action: 'pos.drawer.open' }),
    ).rejects.toMatchObject({ code: 'EMPLOYEE_NOT_AUTHORIZED' });

    const user = await api.settings.users.create({
      email: 'Priya@Pilot.demo',
      displayName: 'Priya Nathan',
      password: 'bakery123',
      roleIds: ['rol_T1_CASHIER'],
      locationIds: ['loc_01BAKERY'],
      employeeId: 'emp_06',
    });
    expect(user).toMatchObject({
      email: 'priya@pilot.demo',
      status: 'ACTIVE',
      employee: { fullName: 'Priya Nathan' },
    });
    await expect(
      api.identity.verifyEmployee({ pin: '6666', action: 'pos.drawer.open' }),
    ).resolves.toBeTruthy();

    // The employee can't get a second sign-in, and the email is taken.
    await expect(
      api.settings.users.create({
        email: 'priya2@pilot.demo',
        displayName: 'Priya 2',
        password: 'bakery123',
        roleIds: ['rol_T1_CASHIER'],
        locationIds: [],
        employeeId: 'emp_06',
      }),
    ).rejects.toMatchObject({
      details: { fieldErrors: { employeeId: 'validation.employeeHasLogin' } },
    });
    await expect(
      api.settings.users.create({
        email: 'cashier@pilot.demo',
        displayName: 'Dup',
        password: 'bakery123',
        roleIds: ['rol_T1_CASHIER'],
        locationIds: [],
      }),
    ).rejects.toMatchObject({ details: { fieldErrors: { email: 'validation.emailTaken' } } });

    await signInAs('priya@pilot.demo', 'loc_01BAKERY', 'bakery123');
    expect((await api.identity.me()).locations.map((l) => l.id)).toEqual(['loc_01BAKERY']);
  });

  it('deactivates a sign-in: sessions end and sign-in is refused', async () => {
    await signInAs('cashier@pilot.demo');
    const cashierToken = useSessionStore.getState().accessToken;
    await owner();
    const cashier = (await api.settings.users.list({ search: 'fathima' }))[0]!;
    await api.settings.users.update(cashier.id, {
      email: cashier.email,
      displayName: cashier.displayName,
      roleIds: cashier.roles.map((r) => r.id),
      locationIds: cashier.locationIds,
      employeeId: cashier.employee?.id ?? null,
      status: 'INACTIVE',
    });
    useSessionStore.getState().signIn(cashierToken!);
    await expect(api.identity.me()).rejects.toMatchObject({ status: 401 });
    await expect(
      api.auth.login({ email: 'cashier@pilot.demo', password: 'demo1234' }),
    ).rejects.toMatchObject({ status: 403, details: { reason: 'ACCOUNT_DISABLED' } });
  });

  it('keeps the last admin and refuses deactivating yourself', async () => {
    await owner();
    const me = (await api.settings.users.list()).find((u) => u.isYou)!;
    const body = {
      email: me.email,
      displayName: me.displayName,
      roleIds: me.roles.map((r) => r.id),
      locationIds: me.locationIds,
      employeeId: me.employee?.id ?? null,
    };
    await expect(
      api.settings.users.update(me.id, { ...body, status: 'INACTIVE' }),
    ).rejects.toMatchObject({ details: { reason: 'SELF_DEACTIVATE' } });
    await expect(
      api.settings.users.update(me.id, { ...body, roleIds: ['rol_T1_MANAGER'] }),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'LAST_ADMIN' } });
  });

  it('resets a password without recording it', async () => {
    await owner();
    const cashier = (await api.settings.users.list({ search: 'cashier@' }))[0]!;
    await api.settings.users.resetPassword(cashier.id, { password: 'newpass99' });
    await expect(
      api.auth.login({ email: 'cashier@pilot.demo', password: 'newpass99' }),
    ).resolves.toBeTruthy();
    const [event] = (await api.audit.list()).items;
    expect(event).toMatchObject({ action: 'settings.user.password', after: null });
  });
});

describe('mock settings: SET-004 roles', () => {
  it('creates a role whose permissions reach the holder on their next request', async () => {
    await owner();
    const role = await api.settings.roles.create({
      name: 'Senior cashier',
      permissions: ['dashboard.view', 'pos.sale.create', 'pos.discount.apply'],
    });
    expect(role).toMatchObject({ code: 'SENIOR_CASHIER', userCount: 0 });
    await expect(
      api.settings.roles.create({ name: 'senior CASHIER', permissions: ['dashboard.view'] }),
    ).rejects.toMatchObject({ details: { fieldErrors: { name: 'validation.nameTaken' } } });

    const cashier = (await api.settings.users.list({ search: 'cashier@' }))[0]!;
    await api.settings.users.update(cashier.id, {
      email: cashier.email,
      displayName: cashier.displayName,
      roleIds: [role.id],
      locationIds: cashier.locationIds,
      employeeId: cashier.employee?.id ?? null,
    });
    await api.settings.roles.update(role.id, {
      name: 'Senior cashier',
      permissions: [...role.permissions, 'pos.refund'],
    });
    await signInAs('cashier@pilot.demo');
    expect((await api.identity.me()).permissions).toEqual(
      expect.arrayContaining(['pos.discount.apply', 'pos.refund']),
    );

    await owner();
    await expect(api.settings.roles.remove(role.id)).rejects.toMatchObject({
      details: { reason: 'ROLE_IN_USE', count: 1 },
    });
  });

  it('locks the Owner role and keeps an admin', async () => {
    await owner();
    await expect(
      api.settings.roles.update('rol_T1_OWNER', { name: 'Owner', permissions: ['dashboard.view'] }),
    ).rejects.toMatchObject({ details: { reason: 'ROLE_LOCKED' } });
    await expect(api.settings.roles.remove('rol_T1_OWNER')).rejects.toMatchObject({
      details: { reason: 'ROLE_LOCKED' },
    });
    const unused = await api.settings.roles.create({ name: 'Temp', permissions: ['kot.view'] });
    await api.settings.roles.remove(unused.id);
    expect((await api.settings.roles.list()).map((r) => r.id)).not.toContain(unused.id);
  });
});

// ── Part 2: SET-001/005/006/008/009/010 ──

const lkr = (rupees: number) => ({ amount: Math.round(rupees * 100), currency: 'LKR' as const });
const SALE = [{ productId: 'prd_01K01', quantity: 1 }];

async function ownerOnDevice(deviceId = 'dev_01') {
  await owner();
  useSessionStore.getState().setDevice(deviceId);
}

describe('mock settings: part 2 access', () => {
  it('is closed to a manager', async () => {
    await signInAs('manager@pilot.demo');
    for (const call of [
      () => api.settings.business.get(),
      () => api.settings.devices.list(),
      () => api.settings.payments.get(),
      () => api.settings.printers.get('loc_01MAIN'),
      () => api.settings.languages.get(),
      () => api.settings.features.get(),
    ]) {
      await expect(call()).rejects.toMatchObject({ status: 403 });
    }
  });
});

describe('mock settings: SET-001 business', () => {
  it('prints the phone and tax number on receipts and renames the business', async () => {
    await ownerOnDevice();
    const before = await api.settings.business.get();
    expect(before).toMatchObject({ name: 'Pilot Foods & Bakery', currency: 'LKR' });
    await api.settings.business.save({
      ...before,
      name: 'Pilot Foods',
      logoText: 'pf',
      primaryColor: 'oklch(0.6 0.13 230)',
      taxRegNo: 'VAT-123456789',
    });
    const me = await api.identity.me();
    expect(me.tenant).toMatchObject({
      name: 'Pilot Foods',
      branding: { logoText: 'PF', primaryColor: 'oklch(0.6 0.13 230)' },
    });
    const order = await api.orders.create({ lines: SALE, adjustmentIds: [], status: 'OPEN' });
    await api.orders.pay(order.id, { method: 'CASH', tendered: lkr(2000) });
    expect((await api.orders.receipt(order.id)).business).toEqual({
      name: 'Pilot Foods',
      logoText: 'PF',
      phone: '+94 11 234 5678',
      taxRegNo: 'VAT-123456789',
    });
  });
});

describe('mock settings: SET-005 devices', () => {
  it('adds a device with a pairing code and turns devices off', async () => {
    await ownerOnDevice('dev_02');
    const added = await api.settings.devices.create({
      name: 'Counter POS 2',
      type: 'POS_TERMINAL',
      locationId: 'loc_01MAIN',
    });
    expect(added).toMatchObject({ isActive: true, paired: false, locationName: 'Main Restaurant' });
    expect(added.activationCode).toMatch(/^\d{6}$/);
    const again = await api.settings.devices.newCode(added.id);
    expect(again.activationCode).toMatch(/^\d{6}$/);

    // Turning off the device this browser uses: it stops being "the device".
    const tablet = (await api.settings.devices.list()).find((d) => d.id === 'dev_02')!;
    expect((await api.identity.me()).device?.id).toBe('dev_02');
    await api.settings.devices.update(tablet.id, { ...tablet, isActive: false });
    expect((await api.identity.me()).device).toBeNull();
    expect((await api.identity.devices('loc_01MAIN')).map((d) => d.id)).not.toContain('dev_02');
  });

  it('keeps a device with an open cash shift where it is', async () => {
    await ownerOnDevice('dev_01');
    // The seed has a shift open on Counter POS 1 (A-283).
    expect(await api.staff.cashShifts.current()).toMatchObject({ status: 'OPEN' });
    const counter = (await api.settings.devices.list()).find((d) => d.id === 'dev_01')!;
    await expect(
      api.settings.devices.update(counter.id, { ...counter, locationId: 'loc_01BAKERY' }),
    ).rejects.toMatchObject({ status: 409, details: { reason: 'DEVICE_SHIFT_OPEN' } });
    // Renaming is fine.
    await expect(
      api.settings.devices.update(counter.id, { ...counter, name: 'Front counter' }),
    ).resolves.toMatchObject({ name: 'Front counter' });
  });

  it('counts devices against the plan', async () => {
    await owner();
    // T1 allows 30; it has 6 active.
    for (let i = 0; i < 24; i++) {
      await api.settings.devices.create({
        name: `Tab ${i}`,
        type: 'TABLET',
        locationId: 'loc_01MAIN',
      });
    }
    await expect(
      api.settings.devices.create({ name: 'One more', type: 'TABLET', locationId: 'loc_01MAIN' }),
    ).rejects.toMatchObject({ details: { reason: 'LIMIT_REACHED', limit: 'devices', max: 30 } });
  });
});

describe('mock settings: SET-006 payment methods', () => {
  it('refuses a method that is off, everywhere, and keeps cash on', async () => {
    await ownerOnDevice();
    await api.settings.payments.save({
      methods: [
        { method: 'CASH', enabled: false },
        { method: 'CARD', enabled: true },
        { method: 'BANK_TRANSFER', enabled: false },
        { method: 'CREDIT', enabled: true },
      ],
    });
    expect(await api.pos.paymentMethods()).toEqual([
      { method: 'CASH', enabled: true },
      { method: 'CARD', enabled: true },
      { method: 'BANK_TRANSFER', enabled: false },
      { method: 'CREDIT', enabled: true },
    ]);
    const order = await api.orders.create({ lines: SALE, adjustmentIds: [], status: 'OPEN' });
    await expect(
      api.orders.pay(order.id, { method: 'BANK_TRANSFER', reference: 'TX1' }),
    ).rejects.toMatchObject({
      status: 400,
      details: { fieldErrors: { method: 'validation.methodOff' } },
    });
    await expect(api.orders.pay(order.id, { method: 'CARD' })).resolves.toMatchObject({
      status: 'PAID',
    });
  });
});

describe('mock settings: SET-008 printers', () => {
  it('names the receipt printer and manages kitchen stations', async () => {
    await ownerOnDevice();
    const main = await api.settings.printers.get('loc_01MAIN');
    expect(main.receiptPrinter).toBe('Receipt Printer');
    const kitchen = main.stations.find((s) => s.id === 'st_01KITCHEN')!;
    expect(kitchen.productCount).toBeGreaterThan(0);
    await expect(api.settings.stations.remove(kitchen.id)).rejects.toMatchObject({
      details: { reason: 'STATION_IN_USE', count: kitchen.productCount },
    });

    await api.settings.printers.save('loc_01MAIN', { receiptPrinter: 'Front Counter Printer' });
    const order = await api.orders.create({ lines: SALE, adjustmentIds: [], status: 'OPEN' });
    await api.orders.pay(order.id, { method: 'CARD' });
    expect(await api.orders.print(order.id)).toMatchObject({ printer: 'Front Counter Printer' });

    const grill = await api.settings.stations.create({
      locationId: 'loc_01MAIN',
      code: 'grl',
      name: 'Grill',
      printerName: 'Grill Printer',
    });
    expect(grill).toMatchObject({ code: 'GRL', productCount: 0 });
    await expect(
      api.settings.stations.create({
        locationId: 'loc_01MAIN',
        code: 'GRL',
        name: 'Dup',
        printerName: 'X Printer',
      }),
    ).rejects.toMatchObject({ details: { fieldErrors: { code: 'validation.codeTaken' } } });
    expect((await api.catalog.kitchenStations.list('loc_01MAIN')).map((s) => s.name)).toContain(
      'Grill',
    );
    await api.settings.stations.remove(grill.id);
    expect((await api.settings.printers.get('loc_01MAIN')).stations.map((s) => s.id)).not.toContain(
      grill.id,
    );
  });
});

describe('mock settings: SET-009 languages', () => {
  it('keeps English, needs the default to be on, and reports name coverage', async () => {
    await owner();
    const before = await api.settings.languages.get();
    expect(before.languages).toEqual(['en', 'ta', 'si']);
    const ta = before.coverage.find((c) => c.language === 'ta')!;
    expect(ta.products).toBeGreaterThan(0);
    expect(ta.productsTranslated).toBeGreaterThan(0);

    await expect(
      api.settings.languages.save({ defaultLanguage: 'si', languages: ['ta'] }),
    ).rejects.toMatchObject({
      details: { fieldErrors: { defaultLanguage: 'validation.defaultLanguageOff' } },
    });
    const saved = await api.settings.languages.save({ defaultLanguage: 'ta', languages: ['ta'] });
    expect(saved).toMatchObject({ defaultLanguage: 'ta', languages: ['en', 'ta'] });
    expect((await api.identity.me()).tenant).toMatchObject({
      defaultLanguage: 'ta',
      languages: ['en', 'ta'],
    });
  });
});

describe('mock settings: SET-010 features', () => {
  it('shows the plan and usage against limits', async () => {
    await owner();
    const plan = await api.settings.features.get();
    expect(plan.status).toBe('ACTIVE');
    expect(plan.features).toContainEqual({ code: 'ADVANCED_REPORTING', enabled: false });
    expect(plan.features).toContainEqual({ code: 'KOT', enabled: true });
    expect(plan.limits).toEqual([
      { code: 'locations', used: 4, max: 10 },
      { code: 'devices', used: 6, max: 30 },
      { code: 'users', used: 7, max: 50 },
    ]);
  });
});
