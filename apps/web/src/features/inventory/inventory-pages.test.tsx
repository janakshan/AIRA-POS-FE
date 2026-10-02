import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { routes } from '@/app/router';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

type User = ReturnType<typeof userEvent.setup>;

async function openAs(
  email: string,
  path: string,
  locationId = 'loc_01MAIN',
  deviceId: string | null = null,
) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(locationId);
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

async function keypad(user: User, dialog: HTMLElement, digits: string) {
  for (const d of digits) await user.click(within(dialog).getByRole('button', { name: d }));
}

const onHand = async (productId: string, locationId: string) =>
  (await api.inventory.get(productId)).levels.find((l) => l.locationId === locationId)?.onHand;

describe('INV-001/002 stock', () => {
  it('shows low and out of stock at the location and filters to them', async () => {
    const { user } = await openAs('manager@pilot.demo', '/inventory/stock');
    // jsdom is narrow: DataTable renders cards, each a button named after the item.
    await screen.findByRole('button', { name: 'Chicken Kottu' }, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Out of stock' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Chicken Kottu' })).toBeNull());
    expect(screen.getByRole('button', { name: 'Vegetable Roti' })).toBeInTheDocument();
  });

  it('shows an item at every location with its minimum', async () => {
    await openAs('owner@pilot.demo', '/inventory/stock/prd_01B03', 'loc_01BAKERY');
    const bakery = await screen.findByLabelText('Bakery Outlet', {}, { timeout: 5000 });
    expect(bakery).toHaveTextContent('24');
    expect(bakery).toHaveTextContent('Low stock');
    expect(bakery).toHaveTextContent('Minimum 30');
    expect(screen.getByLabelText('Central Store')).toHaveTextContent('60');
    expect(await screen.findAllByText('TRF-000001')).not.toHaveLength(0);
  });
});

describe('INV-004 adjustment (FLOW-INV-001)', () => {
  it('item → wastage → quantity → manager PIN → reason → movement + audit', async () => {
    const { user } = await openAs('manager@pilot.demo', '/inventory/adjustments');
    await user.click(
      await screen.findByRole('button', { name: 'Adjust stock' }, { timeout: 5000 }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Adjust stock' });
    await user.type(within(dialog).getByRole('searchbox', { name: /Search items/ }), 'fish bun');
    await user.click(
      await within(dialog).findByRole('button', { name: /^Fish Bun, 80 pcs on hand/ }),
    );

    await user.click(within(dialog).getByRole('radio', { name: /Wastage/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    await keypad(user, dialog, '2');
    expect(dialog).toHaveTextContent('80 → 78');
    await user.click(within(dialog).getByRole('button', { name: 'Continue to approval' }));

    const pin = await screen.findByRole('dialog', { name: 'Employee verification' });
    await keypad(user, pin, '2222');
    const reason = await screen.findByRole('dialog', { name: 'Why adjust Fish Bun?' });
    // Only stock reasons are offered.
    expect(within(reason).queryByRole('radio', { name: 'Loyal customer' })).toBeNull();
    await user.click(within(reason).getByRole('radio', { name: 'Expired' }));
    await user.click(within(reason).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('ADJ-000003 · Fish Bun 80 → 78')).toBeInTheDocument();
    expect(await screen.findByText('ADJ-000003')).toBeInTheDocument();
    expect(await onHand('prd_01S01', 'loc_01MAIN')).toBe(78);
    const [movement] = (await api.stockMovements.list({ productId: 'prd_01S01' })).items;
    expect(movement).toMatchObject({ type: 'WASTAGE', quantity: -2, approvedBy: 'Suresh Kumar' });
  });

  it('won’t take stock below zero', async () => {
    const { user } = await openAs(
      'manager@pilot.demo',
      '/inventory/stock/prd_01R03?location=loc_01MAIN',
    );
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Adjust stock at Main Restaurant' },
        { timeout: 5000 },
      ),
    );
    const dialog = await screen.findByRole('dialog', { name: /Adjust Fish Rice & Curry/ });
    await user.click(within(dialog).getByRole('radio', { name: /Remove stock/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Next' }));
    await keypad(user, dialog, '5');
    expect(dialog).toHaveTextContent("That's more than is in stock");
    expect(within(dialog).getByRole('button', { name: 'Continue to approval' })).toBeDisabled();
  });
});

describe('INV-005 transfers', () => {
  it('dispatches from Central Store and receives at the Bakery with a shortage', async () => {
    const { user } = await openAs('owner@pilot.demo', '/inventory/transfers', 'loc_01STORE');
    await user.click(
      await screen.findByRole('button', { name: 'New transfer' }, { timeout: 5000 }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'New stock transfer' });
    await user.click(within(dialog).getByRole('combobox', { name: 'To' }));
    await user.click(await screen.findByRole('option', { name: 'Bakery Outlet' }));
    await user.type(within(dialog).getByRole('searchbox', { name: /Search items/ }), 'bread');
    await user.click(
      await within(dialog).findByRole('button', { name: /^Sandwich Bread \(450g\), 60/ }),
    );
    // Quantities are typed (QA INV-005: 60 pcs shouldn't take 59 taps) and bounded by on hand.
    const qty = within(dialog).getByRole('spinbutton', {
      name: 'Quantity of Sandwich Bread (450g)',
    });
    await user.clear(qty);
    await user.type(qty, '70');
    expect(dialog).toHaveTextContent('Only 60 available');
    expect(within(dialog).getByRole('button', { name: 'Dispatch 70 items' })).toBeDisabled();
    await user.clear(qty);
    await user.type(qty, '2');
    await user.click(within(dialog).getByRole('button', { name: 'More Sandwich Bread (450g)' }));
    await user.click(within(dialog).getByRole('button', { name: 'Dispatch 3 items' }));
    expect(await screen.findByText('TRF-000002 dispatched to Bakery Outlet')).toBeInTheDocument();
    expect(await onHand('prd_01B03', 'loc_01STORE')).toBe(57);

    // The sender can cancel it but not receive it.
    await user.click(await screen.findByRole('button', { name: 'Open transfer TRF-000002' }));
    let detail = await screen.findByRole('dialog', { name: 'Transfer TRF-000002' });
    expect(within(detail).getByRole('button', { name: 'Cancel transfer' })).toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: /^Receive/ })).toBeNull();
    await user.click(within(detail).getByRole('button', { name: 'Close' }));

    // At the Bakery: receive 2 of 3.
    act(() => useSessionStore.getState().setLocation('loc_01BAKERY'));
    await user.click(await screen.findByRole('button', { name: 'Incoming' }));
    await user.click(await screen.findByRole('button', { name: 'Open transfer TRF-000002' }));
    detail = await screen.findByRole('dialog', { name: 'Transfer TRF-000002' });
    const got = within(detail).getByRole('spinbutton', { name: 'Received Sandwich Bread (450g)' });
    await user.clear(got);
    await user.tab();
    expect(detail).toHaveTextContent('Enter how many arrived (0 if none)');
    await user.type(got, '4');
    expect(detail).toHaveTextContent('Only 3 were sent');
    expect(within(detail).getByRole('button', { name: /^Receive/ })).toBeDisabled();
    await user.clear(got);
    await user.type(got, '2');
    expect(detail).toHaveTextContent('1 unit less than was sent');
    await user.click(within(detail).getByRole('button', { name: 'Receive (1 short)' }));
    expect(await screen.findByText('TRF-000002 received')).toBeInTheDocument();
    expect(await onHand('prd_01B03', 'loc_01BAKERY')).toBe(26);
  });
});

describe('INV-006 low stock', () => {
  it('lists low items by location and prefills a transfer in from the best source', async () => {
    const { user } = await openAs('owner@pilot.demo', '/inventory/low-stock', 'loc_01BAKERY');
    const main = await screen.findByRole(
      'list',
      { name: 'Low stock at Main Restaurant' },
      { timeout: 5000 },
    );
    expect(within(main).getByText('Vegetable Roti')).toBeInTheDocument();
    expect(within(main).getByText('Fish Rice & Curry')).toBeInTheDocument();
    const bakery = screen.getByRole('list', { name: 'Low stock at Bakery Outlet' });
    expect(bakery).toHaveTextContent('24 pcs on hand · minimum 30');

    await user.click(
      within(bakery).getByRole('button', {
        name: 'Transfer Sandwich Bread (450g) to Bakery Outlet',
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'New stock transfer' });
    expect(within(dialog).getByText('Sandwich Bread (450g)')).toBeInTheDocument();
    // Twice the minimum minus what's there: 60 − 24 = 36.
    expect(within(dialog).getByRole('button', { name: 'Dispatch 36 items' })).toBeEnabled();
  });
});

describe('POS stock (block at zero)', () => {
  beforeEach(() => {
    const original = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ ...original(query), matches: query.includes('1024px') }) as MediaQueryList,
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it('shows out of stock and low tiles, and caps the cart at what is on hand', async () => {
    const { user } = await openAs('cashier@pilot.demo', '/pos', 'loc_01MAIN', 'dev_01');
    await user.click(await screen.findByRole('tab', { name: /Short Eats/ }, { timeout: 5000 }));
    const roti = within(screen.getByRole('tabpanel')).getByRole('button', {
      name: /Vegetable Roti/,
    });
    expect(roti).toBeDisabled();
    expect(roti).toHaveTextContent('Out of stock');
    expect(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: /Egg Pastry/ }),
    ).toHaveTextContent('2 left');

    await user.click(screen.getByRole('tab', { name: /Rice & Curry/ }));
    const fish = within(screen.getByRole('tabpanel')).getByRole('button', {
      name: /Fish Rice & Curry/,
    });
    for (let i = 0; i < 4; i++) await user.click(fish);
    expect(await screen.findByText('Only 3 Fish Rice & Curry left')).toBeInTheDocument();
    expect(
      within(screen.getByRole('complementary', { name: /Current sale/ })).getByRole('button', {
        name: /3×Fish Rice & Curry/,
      }),
    ).toBeInTheDocument();
  });
});
