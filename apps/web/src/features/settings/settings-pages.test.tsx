import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { routes } from '@/app/router';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';
import { useUiStore } from '@/stores/ui-store';

async function openAs(email: string, path: string) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation('loc_01MAIN');
  useSessionStore.getState().setDevice(null);
  queryClient.clear();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, user: userEvent.setup() };
}

const wait = { timeout: 5000 };

describe('SET-007 charges', () => {
  it('changes the service charge rate the POS uses', async () => {
    const { user } = await openAs('owner@pilot.demo', '/settings/charges');
    const service = await screen.findByRole('region', { name: 'Service charge' }, wait);
    const rate = within(service).getByLabelText('Default');
    expect(rate).toHaveValue('10');
    await user.clear(rate);
    await user.type(rate, '12.5');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Charges saved for Main Restaurant')).toBeInTheDocument();
    expect((await api.pos.settings()).serviceChargeBps).toBe(1250);
  }, 15_000);
});

describe('SET-002 locations', () => {
  it('adds a location', async () => {
    const { user } = await openAs('owner@pilot.demo', '/settings/locations');
    await screen.findByText('Central Store', undefined, wait);
    await user.click(screen.getByRole('button', { name: /Add location/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Code'), 'gal');
    await user.type(within(dialog).getByLabelText('Name'), 'Galle Road');
    await user.type(within(dialog).getByLabelText('Address'), '12 Galle Road, Colombo 3');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Galle Road added')).toBeInTheDocument();
    expect(await screen.findByText('Galle Road', { selector: 'span' })).toBeInTheDocument();
  }, 15_000);
});

describe('SET-003 users', () => {
  it('creates a sign-in for an employee from the employee page link', async () => {
    const { user } = await openAs('owner@pilot.demo', '/settings/users?employee=emp_06');
    const dialog = await screen.findByRole('dialog', undefined, wait);
    await waitFor(() => expect(within(dialog).getByLabelText('Name')).toHaveValue('Priya Nathan'));
    await user.type(within(dialog).getByLabelText('Email'), 'priya@pilot.demo');
    await user.type(within(dialog).getByLabelText('Temporary password'), 'bakery123');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Cashier' }));
    await user.click(within(dialog).getByRole('checkbox', { name: 'Bakery Outlet' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Priya Nathan can now sign in')).toBeInTheDocument();
    const users = await api.settings.users.list({ search: 'priya' });
    expect(users[0]).toMatchObject({
      employee: { id: 'emp_06' },
      locationIds: ['loc_01BAKERY'],
      roles: [{ name: 'Cashier' }],
    });
  }, 15_000);

  it("won't let you turn off your own sign-in", async () => {
    const { user } = await openAs('owner@pilot.demo', '/settings/users');
    await user.click(await screen.findByRole('button', { name: 'Nirmala Rajan' }, wait));
    const dialog = await screen.findByRole('dialog');
    // Can't turn off your own sign-in.
    expect(within(dialog).getByRole('checkbox', { name: /Can sign in/ })).toBeDisabled();
  }, 15_000);
});

describe('SET-004 roles', () => {
  it('copies a role, adds a permission and saves it', async () => {
    const { user, router } = await openAs(
      'owner@pilot.demo',
      '/settings/roles/new?copy=rol_T1_CASHIER',
    );
    const name = await screen.findByLabelText('Role', undefined, wait);
    expect(name).toHaveValue('Cashier (copy)');
    await user.clear(name);
    await user.type(name, 'Senior cashier');
    await user.click(screen.getByRole('checkbox', { name: /Approve discounts/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/settings/roles'));
    const role = (await api.settings.roles.list()).find((r) => r.name === 'Senior cashier');
    expect(role?.permissions).toEqual(
      expect.arrayContaining(['pos.sale.create', 'pos.discount.apply']),
    );
  }, 15_000);

  it('opens the Owner role read-only', async () => {
    await openAs('owner@pilot.demo', '/settings/roles/rol_T1_OWNER');
    expect(
      await screen.findByText(/always has every permission/, undefined, wait),
    ).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Approve discounts/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});

describe('settings access', () => {
  it('is denied to a manager', async () => {
    await openAs('manager@pilot.demo', '/settings/roles');
    expect(await screen.findByText('Access denied', undefined, wait)).toBeInTheDocument();
  });
});

// ── Part 2 ──

describe('SET-001 business', () => {
  it('renames the business and shows it in the shell', async () => {
    const { user } = await openAs('owner@pilot.demo', '/settings/business');
    const name = await screen.findByLabelText('Business name', undefined, wait);
    await user.clear(name);
    await user.type(name, 'Pilot Foods');
    await user.type(screen.getByLabelText('Tax registration number'), 'VAT-1234');
    expect(
      within(screen.getByRole('region', { name: 'Preview' })).getByText('Tax reg. no: VAT-1234'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Business details saved')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByText('Pilot Foods', { selector: 'span' }).length).toBeGreaterThan(0),
    );
  }, 15_000);
});

describe('SET-005 devices', () => {
  it('adds a device and shows its pairing code', async () => {
    const { user } = await openAs('owner@pilot.demo', '/settings/devices');
    await screen.findByText('Kitchen Display', undefined, wait);
    await user.click(screen.getByRole('button', { name: /Add device/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'Counter POS 2');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Counter POS 2 added')).toBeInTheDocument();
    const pairing = await screen.findByRole('dialog', { name: 'Pair Counter POS 2' });
    expect(within(pairing).getByLabelText(/^Activation code: \d( \d){5}$/)).toBeInTheDocument();
  }, 15_000);

  it('uses a device on this browser', async () => {
    const { user } = await openAs('owner@pilot.demo', '/settings/devices');
    await user.click(
      await screen.findByRole('button', { name: 'Use on this browser: Waiter Tablet 1' }, wait),
    );
    expect(useSessionStore.getState().deviceId).toBe('dev_02');
    expect(await screen.findByText('This browser')).toBeInTheDocument();
  }, 15_000);
});

describe('SET-006 payment methods', () => {
  it('turns off credit sales for the POS', async () => {
    const { user } = await openAs('owner@pilot.demo', '/settings/payments');
    expect(await screen.findByRole('switch', { name: 'Cash' }, wait)).toBeDisabled();
    await user.click(screen.getByRole('switch', { name: 'Credit sale' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Payment methods saved')).toBeInTheDocument();
    expect(await api.pos.paymentMethods()).toContainEqual({ method: 'CREDIT', enabled: false });
  }, 15_000);
});

describe('SET-008 printers', () => {
  it('adds a kitchen station', async () => {
    const { user } = await openAs('owner@pilot.demo', '/settings/printers');
    await screen.findByText('Beverage Bar', undefined, wait);
    await user.click(screen.getByRole('button', { name: /Add station/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Station'), 'Grill');
    await user.type(within(dialog).getByLabelText('Code'), 'grl');
    await user.type(within(dialog).getByLabelText('Printer'), 'Grill Printer');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Grill added')).toBeInTheDocument();
    expect(await screen.findByText('Grill Printer')).toBeInTheDocument();
  }, 15_000);
});

describe('SET-009 languages', () => {
  afterEach(() => useUiStore.setState({ language: null }));

  it('takes a turned-off language out of the language menu', async () => {
    const { user } = await openAs('owner@pilot.demo', '/settings/languages');
    await user.click(await screen.findByRole('checkbox', { name: /සිංහල/ }, wait));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Languages saved')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Language' })[0]!);
    expect(await screen.findByRole('menuitemradio', { name: 'தமிழ்' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemradio', { name: 'සිංහල' })).toBeNull();
  }, 15_000);

  it('shows Settings in Tamil', async () => {
    useUiStore.setState({ language: 'ta' });
    await openAs('owner@pilot.demo', '/settings/users');
    expect(await screen.findByRole('heading', { name: 'பயனர்கள்' }, wait)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /உள்நுழைவு சேர்/ })).toBeInTheDocument();
  }, 15_000);
});

describe('SET-010 features', () => {
  it('shows what the plan includes', async () => {
    await openAs('owner@pilot.demo', '/settings/features');
    const reporting = await screen.findByRole('region', { name: 'Advanced reporting' }, wait);
    expect(within(reporting).getByText('Not in your plan')).toBeInTheDocument();
    expect(
      within(screen.getByRole('region', { name: 'Kitchen (KOT)' })).getByText('Included'),
    ).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Devices: 6 of 30' })).toBeInTheDocument();
  });
});
