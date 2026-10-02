import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { routes } from '@/app/router';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

type User = ReturnType<typeof userEvent.setup>;

async function openAs(email: string, path: string, deviceId: string | null = null) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation('loc_01MAIN');
  useSessionStore.getState().setDevice(deviceId);
  queryClient.clear();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, user: userEvent.setup() };
}

async function approveWithPin(user: User, pin: string, reasonTitle: RegExp, reason: string) {
  const pinDialog = await screen.findByRole('dialog', { name: 'Employee verification' });
  for (const digit of pin) await user.click(within(pinDialog).getByRole('button', { name: digit }));
  const reasonDialog = await screen.findByRole('dialog', { name: reasonTitle });
  await user.click(within(reasonDialog).getByRole('radio', { name: reason }));
  await user.click(within(reasonDialog).getByRole('button', { name: 'Confirm' }));
}

const mealsOf = async (employeeId: string) => (await api.staff.meals.list({ employeeId })).length;
const atMain = async (productId: string) =>
  (await api.inventory.get(productId)).levels.find((l) => l.locationId === 'loc_01MAIN')!.onHand;
const teaAtMain = () => atMain('prd_01D02');

describe('HR-005 staff meal (§22)', () => {
  it('records a meal with a manager PIN: stock moves, nothing is paid', async () => {
    const { user } = await openAs('manager@pilot.demo', '/staff/meals');
    const before = await mealsOf('emp_04');
    const tea = await teaAtMain();
    await user.click(
      await screen.findByRole('button', { name: /Record staff meal/ }, { timeout: 5000 }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Staff meal' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Employee' }));
    await user.click(await screen.findByRole('option', { name: /Kasun Perera/ }));
    await user.click(within(dialog).getByRole('combobox', { name: 'Item' }));
    await user.click(await screen.findByRole('option', { name: /^Milk Tea/ }));
    await user.click(within(dialog).getByRole('button', { name: /Add/ }));
    await user.click(within(dialog).getByRole('button', { name: /^Record ·/ }));
    await approveWithPin(user, '2222', /Staff meal for Kasun Perera/, 'Meal on shift');
    await waitFor(async () => expect(await mealsOf('emp_04')).toBe(before + 1));
    expect(await teaAtMain()).toBe(tea - 1);
  }, 30_000);
});

describe('A-312 void a staff meal', () => {
  it('voids today’s meal with a manager PIN: stock comes back and the row is badged', async () => {
    const { accessToken } = await api.auth.login({
      email: 'manager@pilot.demo',
      password: 'demo1234',
    });
    useSessionStore.getState().signIn(accessToken);
    useSessionStore.getState().setLocation('loc_01MAIN');
    const tea = await teaAtMain();
    const { verificationId } = await api.identity.verifyEmployee({
      pin: '2222',
      action: 'staff.meal',
    });
    const meal = await api.staff.meals.create({
      employeeId: 'emp_04',
      lines: [{ productId: 'prd_01D02', quantity: 1 }],
      verification: { verificationId, reasonCode: 'MEAL_BREAK' },
    });
    expect(await teaAtMain()).toBe(tea - 1);

    const { user } = await openAs('manager@pilot.demo', '/staff/meals');
    await user.click(
      await screen.findByRole('button', { name: `Void ${meal.number}` }, { timeout: 5000 }),
    );
    await approveWithPin(
      user,
      '2222',
      new RegExp(`Void staff meal ${meal.number}`),
      'Recorded for the wrong employee',
    );
    await waitFor(async () =>
      expect((await api.staff.meals.list({ employeeId: 'emp_04' }))[0]).toMatchObject({
        id: meal.id,
        status: 'VOIDED',
      }),
    );
    expect(await teaAtMain()).toBe(tea);
    expect((await screen.findAllByText('Voided')).length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: `Void ${meal.number}` })).not.toBeInTheDocument(),
    );
  }, 30_000);
});

describe('HR-006 food allowance (§23)', () => {
  it('shows who is over and by how much', async () => {
    await openAs('manager@pilot.demo', '/staff/allowance');
    expect(
      await screen.findByRole('link', { name: 'Kasun Perera' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    const kasun = (await api.staff.allowance()).rows.find((r) => r.employeeId === 'emp_04')!;
    expect(kasun.excess.amount).toBeGreaterThan(0);
    expect(screen.getAllByText('Deduct from salary').length).toBeGreaterThan(0);
  });
});

describe('HR-003 clock in / out', () => {
  it('toggles an employee with their PIN on the shared device', async () => {
    const { user } = await openAs('manager@pilot.demo', '/staff/attendance');
    const card = (await screen.findByText('Clock in / out', undefined, { timeout: 5000 })).closest(
      'div[data-slot="card"], .rounded-xl, section, article',
    ) as HTMLElement | null;
    const scope = card ? within(card.parentElement ?? card) : screen;
    for (const d of '3333') await user.click(scope.getAllByRole('button', { name: d })[0]!);
    expect(await screen.findByText(/Fathima Rizvi clocked (in|out)/)).toBeInTheDocument();
  });
});

describe('HR-004 cash drawer', () => {
  it('counts and closes the open shift on this device', async () => {
    const { user } = await openAs('manager@pilot.demo', '/staff/shifts?tab=drawer', 'dev_01');
    const counted = await screen.findByRole('textbox', { name: 'Counted' }, { timeout: 5000 });
    await user.type(counted, '3300');
    await user.type(screen.getByLabelText('Your PIN'), '3333');
    await user.click(screen.getByRole('button', { name: /Close shift/ }));
    await waitFor(async () => expect(await api.staff.cashShifts.current()).toBeNull());
    // Handover: the next person opens with that count.
    expect(await screen.findByText(/that's the float to start with/)).toBeInTheDocument();
  }, 20_000);
});

describe('POS staff meal', () => {
  beforeEach(() => {
    const original = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ ...original(query), matches: query.includes('1024px') }) as MediaQueryList,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('turns the cart into a staff meal with no payment and clears it', async () => {
    const { user } = await openAs('cashier@pilot.demo', '/pos', 'dev_01');
    const buns = await atMain('prd_01S01');
    await user.click(await screen.findByRole('tab', { name: /Short Eats/ }, { timeout: 5000 }));
    await user.click(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: /Fish Bun/ }),
    );
    await user.click(screen.getByRole('button', { name: /Staff meal/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Staff meal' });
    await user.click(within(dialog).getByRole('combobox', { name: 'Employee' }));
    await user.click(await screen.findByRole('option', { name: /Arun Selvam/ }));
    await user.click(within(dialog).getByRole('button', { name: /^Record ·/ }));
    await approveWithPin(user, '2222', /Staff meal for Arun Selvam/, 'Meal on shift');
    await waitFor(async () => expect(await atMain('prd_01S01')).toBe(buns - 1));
    const sale = screen.getByRole('complementary', { name: /Current sale/ });
    expect(await within(sale).findByText('No items yet')).toBeInTheDocument();
    // HR sees it (the cashier can ring it up but not view staff records).
    const { accessToken } = await api.auth.login({
      email: 'manager@pilot.demo',
      password: 'demo1234',
    });
    useSessionStore.getState().signIn(accessToken);
    const [meal] = await api.staff.meals.list({ employeeId: 'emp_05' });
    expect(meal).toMatchObject({ source: 'POS', approvedBy: 'Suresh Kumar' });
  }, 30_000);
});
