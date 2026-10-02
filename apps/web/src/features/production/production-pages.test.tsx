import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { routes } from '@/app/router';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

type User = ReturnType<typeof userEvent.setup>;

async function openAs(email: string, path: string, locationId = 'loc_01BAKERY') {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(locationId);
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

async function keypad(user: User, dialog: HTMLElement, digits: string) {
  for (const d of digits) await user.click(within(dialog).getByRole('button', { name: d }));
}

const BAKERY = 'loc_01BAKERY';
const onHand = async (productId: string) =>
  (await api.inventory.get(productId)).levels.find((l) => l.locationId === BAKERY)?.onHand;

describe('BAK-001 production dashboard', () => {
  it("shows today's batches, the flour shortage and a link to order it", async () => {
    // The manager's current location is Main: the dashboard picks the Bakery.
    await openAs('manager@pilot.demo', '/production/bakery', 'loc_01MAIN');
    expect(
      await screen.findByText(/1 raw material is short/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Wheat Flour: need 20 packs, have 18')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Order what's short/ })).toHaveAttribute(
      'href',
      '/purchasing/orders/new?location=loc_01BAKERY&lines=ing_01FLOUR%3A2',
    );
    expect(await screen.findByText('22 / 88')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /Record output of BAT-\d+ Chocolate Cake Slice/ }),
    ).toBeInTheDocument();
  });
});

describe('FLOW-BAK-001 plan → batch → output → finished goods → wastage', () => {
  it('runs a plan through to finished-goods stock', async () => {
    const { user, router } = await openAs('manager@pilot.demo', '/production/plan/new');
    const cake = (await onHand('prd_01B02'))!;

    // Plan 30 butter cake slices: 2 runs of 24.
    const qty = await screen.findByRole(
      'spinbutton',
      { name: 'Planned Butter Cake Slice' },
      { timeout: 5000 },
    );
    await user.type(qty, '30');
    expect(await screen.findByText('2 runs → 48')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/production\/plan\/pln_/),
    );

    await user.click(await screen.findByRole('button', { name: 'Confirm plan' }));
    const start = await screen.findByRole(
      'button',
      { name: /Start BAT-\d+ Butter Cake Slice/ },
      { timeout: 5000 },
    );

    // Start: raw materials leave stock.
    const flour = (await onHand('ing_01FLOUR'))!;
    await user.click(start);
    const startDialog = await screen.findByRole('dialog', { name: /Start BAT-\d+/ });
    await user.click(within(startDialog).getByRole('button', { name: 'Start batch' }));
    await waitFor(async () => expect(await onHand('ing_01FLOUR')).toBe(flour - 4));

    // Record output: 46 good, 2 burnt.
    await user.click(
      await screen.findByRole('button', { name: /Record output of BAT-\d+ Butter Cake Slice/ }),
    );
    const output = await screen.findByRole('dialog', { name: /Output of BAT-\d+/ });
    const good = within(output).getByRole('spinbutton', { name: 'Good units' });
    await user.clear(good);
    await user.type(good, '46');
    await user.type(within(output).getByRole('spinbutton', { name: 'Rejected' }), '2');
    await user.click(within(output).getByRole('combobox', { name: 'Why rejected' }));
    await user.click(await screen.findByRole('option', { name: 'Burnt / over-baked' }));
    expect(output).toHaveTextContent('48 out of the oven → 46 pcs into stock, 2 to wastage');
    await user.click(within(output).getByRole('button', { name: 'Record output' }));
    await waitFor(async () => expect(await onHand('prd_01B02')).toBe(cake + 46));
    // The plan follows its only batch.
    await waitFor(async () => {
      const id = router.state.location.pathname.split('/').pop()!;
      expect((await api.production.plans.get(id)).status).toBe('COMPLETED');
    });
  }, 30_000);

  it('writes off finished goods with a manager PIN and lists it as wastage', async () => {
    const { user } = await openAs('manager@pilot.demo', '/production/finished-goods');
    const before = (await onHand('prd_01B01'))!;
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Write off Chocolate Cake Slice' },
        { timeout: 5000 },
      ),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Write off Chocolate Cake Slice' });
    await user.click(within(dialog).getByRole('button', { name: 'Write off' }));
    const pin = await screen.findByRole('dialog', { name: 'Employee verification' });
    await keypad(user, pin, '2222');
    const reason = await screen.findByRole('dialog', {
      name: 'Why is Chocolate Cake Slice being written off?',
    });
    expect(within(reason).queryByRole('radio', { name: 'Loyal customer' })).toBeNull();
    await user.click(within(reason).getByRole('radio', { name: 'Damaged item' }));
    await user.click(within(reason).getByRole('button', { name: 'Confirm' }));
    await waitFor(async () => expect(await onHand('prd_01B01')).toBe(before - 1));

    const wastage = await api.production.wastage.list({ locationId: BAKERY, days: 0 });
    expect(wastage.items[0]).toMatchObject({
      source: 'FINISHED_GOODS',
      quantity: 1,
      approvedBy: 'Suresh Kumar',
      reason: { code: 'DAMAGED' },
    });
  }, 20_000);
});

describe('BAK-005 wastage', () => {
  it('lists batch rejects and write-offs with totals by reason', async () => {
    const { user } = await openAs('manager@pilot.demo', '/production/wastage?range=month');
    expect(
      await screen.findByRole('button', { name: /^Burnt \/ over-baked · \d+/ }, { timeout: 5000 }),
    ).toBeInTheDocument();
    // 3 cake slices written off here + 6 loaves through INV-004: the same ledger.
    await user.click(screen.getByRole('button', { name: /^Expired · 9/ }));
    expect(await screen.findByText('9 units wasted')).toBeInTheDocument();
  });
});
