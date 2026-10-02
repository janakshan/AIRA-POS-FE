import { act, render, screen, waitFor, within } from '@testing-library/react';
import { http } from 'msw';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/app/i18n';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { routes } from '@/app/router';
import { api } from '@/lib/api';
import { API, apiError } from '@/mocks/http';
import { server } from '@/mocks/node';
import { useCartStore } from '@/features/pos/store/cart-store';
import { useSessionStore } from '@/stores/session-store';
import { useUiStore } from '@/stores/ui-store';

async function openPos(email: string, locationId: string, deviceId: string | null = null) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(locationId);
  useSessionStore.getState().setDevice(deviceId);
  queryClient.clear();
  render(
    <AppProviders>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: ['/pos'] })} />
    </AppProviders>,
  );
}

describe('POS-001 Quick Pad', () => {
  it('shows the location’s categories and products from the catalog API', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    const rail = await screen.findByRole('tablist', { name: 'Categories' });
    // Top level counts include subcategories.
    expect(
      within(rail)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual([
      'Rice & Curry16',
      'Kottu9',
      'Short Eats12',
      'Bakery10',
      'Drinks13',
      'Hoppers5',
      'Noodles4',
      'Soups3',
      'Devilled & Grills4',
      'Desserts5',
    ]);

    // Rice & Curry has subcategories: tapping drills in, keeping its own products first.
    await user.click(within(rail).getByRole('tab', { name: /Rice & Curry/ }));
    expect(
      within(rail)
        .getAllByRole('tab')
        .map((t) => t.textContent),
    ).toEqual(['Rice & Curry7', 'Fried Rice5', 'Biriyani4']);
    await user.click(within(rail).getByRole('tab', { name: /Biriyani/ }));
    const biriyani = screen.getByRole('tabpanel', { name: 'Biriyani' });
    expect(within(biriyani).getByRole('button', { name: /Mutton Biriyani/ })).toBeDisabled();

    // Back to the top level, then Drinks (no direct products → first subcategory).
    await user.click(screen.getByRole('button', { name: 'Rice & Curry' }));
    await user.click(within(rail).getByRole('tab', { name: /Drinks/ }));
    await user.click(within(rail).getByRole('tab', { name: /Cold Drinks/ }));
    const cold = screen.getByRole('tabpanel', { name: 'Cold Drinks' });
    // Location price override: Iced Coffee is 400 here, not the 450 base price.
    expect(within(cold).getByRole('button', { name: /Iced Coffee/ })).toHaveTextContent('400.00');

    await user.click(within(rail).getByRole('tab', { name: /Hot Drinks/ }));
    const hot = screen.getByRole('tabpanel', { name: 'Hot Drinks' });
    await user.click(within(hot).getByRole('button', { name: /Milk Tea/ }));
    await user.click(within(hot).getByRole('button', { name: /Milk Tea/ }));
    expect(within(hot).getByRole('button', { name: /Milk Tea/ })).toHaveTextContent('×2');
    // Narrow jsdom viewport: the sale is summarised in the bottom bar.
    expect(screen.getByRole('button', { name: /2 items/ })).toHaveTextContent('View sale');
  });

  it('re-keys the catalog when the location changes', async () => {
    await openPos('manager@pilot.demo', 'loc_01MAIN');
    await screen.findByRole('tab', { name: /Kottu/ });

    act(() => useSessionStore.getState().setLocation('loc_01BAKERY'));
    await screen.findByRole('tabpanel', { name: 'Short Eats' });
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent);
    expect(tabs).toEqual(['Short Eats4', 'Bakery10', 'Drinks6']);
  });

  it('follows the Quick Pad layout saved for the location (CAT-007)', async () => {
    const { accessToken } = await api.auth.login({
      email: 'owner@pilot.demo',
      password: 'demo1234',
    });
    useSessionStore.getState().signIn(accessToken);
    useSessionStore.getState().setLocation('loc_01MAIN');
    const layout = await api.catalog.quickPad.get('loc_01MAIN');
    await api.catalog.quickPad.update('loc_01MAIN', {
      ...layout,
      categoryOrder: ['cat_01DRINKS', ...layout.categoryOrder.filter((c) => c !== 'cat_01DRINKS')],
    });
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const tabs = await screen.findAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('Drinks');
  });

  it('shows the stable error code when the catalog API fails', async () => {
    server.use(http.get(`${API}/location-products`, () => apiError('FORBIDDEN', 403, 'Nope')));
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    expect(await screen.findByText(/FORBIDDEN · req_/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('shows Tamil names when the cashier works in Tamil (REQ-861…883)', async () => {
    useUiStore.setState({ language: 'ta' });
    try {
      await openPos('cashier@pilot.demo', 'loc_01MAIN');
      expect(await screen.findByRole('tab', { name: /கொத்து/ })).toBeInTheDocument();
      await userEvent.setup().click(screen.getByRole('tab', { name: /கொத்து/ }));
      // Translated where available, English otherwise.
      expect(screen.getByRole('button', { name: /கோழி கொத்து/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cheese Kottu/ })).toBeInTheDocument();
    } finally {
      useUiStore.setState({ language: null });
      await act(() => i18n.changeLanguage('en'));
    }
  });

  it('uses the terminal’s own Quick Pad layout when one is saved', async () => {
    const { accessToken } = await api.auth.login({
      email: 'owner@pilot.demo',
      password: 'demo1234',
    });
    useSessionStore.getState().signIn(accessToken);
    useSessionStore.getState().setLocation('loc_01MAIN');
    const layout = await api.catalog.quickPad.get('loc_01MAIN', 'dev_02');
    await api.catalog.quickPad.update(
      'loc_01MAIN',
      {
        ...layout,
        categoryOrder: [
          'cat_01BAKERY',
          ...layout.categoryOrder.filter((c) => c !== 'cat_01BAKERY'),
        ],
      },
      'dev_02',
    );
    await openPos('owner@pilot.demo', 'loc_01MAIN', 'dev_02');
    const tabs = await screen.findAllByRole('tab');
    expect(tabs[0]).toHaveTextContent('Bakery');
  });
});

/** Terminal / landscape tablet: the cart is a fixed side panel. */
function useWideViewport() {
  beforeEach(() => {
    const original = window.matchMedia;
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({ ...original(query), matches: query.includes('1024px') }) as MediaQueryList,
    );
  });
  afterEach(() => vi.restoreAllMocks());
}

const sale = () => screen.getByRole('complementary', { name: /Current sale|Order / });

async function tapTile(user: ReturnType<typeof userEvent.setup>, tab: RegExp, product: RegExp) {
  await user.click(await screen.findByRole('tab', { name: tab }));
  await user.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: product }));
}

describe('POS-001 cart and totals', () => {
  useWideViewport();

  it('adds taps to the cart and shows service charge and total (Main Restaurant)', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await within(await screen.findByRole('complementary', { name: /Current sale/ })).findByText(
      'No items yet',
    );
    await tapTile(user, /Rice & Curry/, /Chicken Rice & Curry/);
    await user.click(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: /Chicken Rice & Curry/ }),
    );
    // Rice & Curry drilled into its subcategories; go back up a level.
    await user.click(screen.getByRole('button', { name: 'Rice & Curry' }));
    await tapTile(user, /Short Eats/, /Fish Bun/);

    const panel = sale();
    expect(
      within(panel)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([
      expect.stringContaining('2×Chicken Rice & Curry'),
      expect.stringContaining('1×Fish Bun'),
    ]);
    // 2 × 800 + 120 = 1,720 · 10% service = 172 · total 1,892
    expect(panel).toHaveTextContent('SubtotalLKR 1,720.00');
    expect(panel).toHaveTextContent('Service charge (10%)LKR 172.00');
    expect(panel).toHaveTextContent('LKR 1,892.00');
    expect(within(panel).getByRole('button', { name: /Pay · LKR.1,892\.00/ })).toBeEnabled();
    expect(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: /Fish Bun/ }),
    ).toHaveTextContent('×1');
  });

  it('changes quantity with the stepper, the keypad and the keyboard, and removes lines', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await tapTile(user, /Short Eats/, /Fish Bun/);
    const panel = sale();
    await user.click(within(panel).getByRole('button', { name: /1×Fish Bun/ }));
    await user.click(within(panel).getByRole('button', { name: 'Increase Fish Bun' }));
    expect(within(panel).getByRole('button', { name: /2×Fish Bun/ })).toBeInTheDocument();

    await user.click(within(panel).getByRole('button', { name: 'Quantity for Fish Bun' }));
    const keypad = await screen.findByRole('dialog', { name: 'Quantity for Fish Bun' });
    await user.click(within(keypad).getByRole('button', { name: '1' }));
    await user.click(within(keypad).getByRole('button', { name: '2' }));
    await user.click(within(keypad).getByRole('button', { name: 'Set quantity' }));
    expect(within(panel).getByRole('button', { name: /12×Fish Bun/ })).toBeInTheDocument();
    expect(panel).toHaveTextContent('SubtotalLKR 1,440.00');

    // Keyboard: − on the selected line, Delete removes it.
    await user.keyboard('-');
    expect(within(panel).getByRole('button', { name: /11×Fish Bun/ })).toBeInTheDocument();
    await user.keyboard('{Delete}');
    expect(within(panel).getByText('No items yet')).toBeInTheDocument();
  });

  it('adds from search (tap a result or Enter on a code)', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    const search = await screen.findByRole('searchbox', { name: 'Search products' });
    await user.type(search, 'kot');
    expect(screen.getByText('9 matches')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Egg Kottu/ }));
    expect(search).toHaveValue('');

    await user.type(search, 's01{Enter}');
    expect(
      within(sale())
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual([expect.stringContaining('Egg Kottu'), expect.stringContaining('Fish Bun')]);

    await user.type(search, 'zzz');
    expect(screen.getByText('No products match “zzz” here')).toBeInTheDocument();
  });

  it('adds scanned barcodes and rejects unknown ones', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup({ delay: null });
    await screen.findByRole('tab', { name: /Kottu/ });
    await user.keyboard('4790001000123{Enter}');
    expect(
      await within(sale()).findByRole('button', { name: /1×Sandwich Bread/ }),
    ).toBeInTheDocument();
    await user.keyboard('9999999999{Enter}');
    expect(
      await screen.findByText("Barcode 9999999999 isn't sold at this location"),
    ).toBeInTheDocument();
  });

  it('keeps the cart through a reload and keeps each location’s cart separate', async () => {
    await openPos('manager@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    const saved = localStorage.getItem('rbp.pos.carts');
    expect(saved).toContain('prd_01K01');

    // Bakery has its own (empty) cart and no service charge.
    act(() => useSessionStore.getState().setLocation('loc_01BAKERY'));
    // Main's Kottu category isn't sold at the bakery, so its tab going away marks the switch.
    await waitFor(() => expect(screen.queryByRole('tab', { name: /Kottu/ })).toBeNull());
    expect(within(sale()).getByText('No items yet')).toBeInTheDocument();
    await tapTile(user, /Bakery/, /Butter Cake Slice/);
    expect(sale()).not.toHaveTextContent('Service charge');

    // Back at Main, after a "reload" from storage, the kottu is still there.
    const stored = localStorage.getItem('rbp.pos.carts') ?? '';
    act(() => useCartStore.setState({ carts: {} }));
    localStorage.setItem('rbp.pos.carts', stored);
    await act(() => useCartStore.persist.rehydrate());
    act(() => useSessionStore.getState().setLocation('loc_01MAIN'));
    expect(
      await within(sale()).findByRole('button', { name: /1×Chicken Kottu/ }),
    ).toBeInTheDocument();
  });

  it('adds VAT on tax-exclusive items (grocery)', async () => {
    await openPos('cashier@grocery.demo', 'loc_02TOWN');
    const user = userEvent.setup();
    await tapTile(user, /Dairy/, /Fresh Milk 1L/);
    // 480.00 + 18% VAT 86.40 = 566.40
    expect(sale()).toHaveTextContent('VAT (18%)LKR 86.40');
    expect(sale()).toHaveTextContent('LKR 566.40');
  });
});

describe('POS-001 on a phone', () => {
  it('shows the running total in a bottom bar that opens the sale', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Cheese Kottu/);
    await user.click(screen.getByRole('button', { name: /1 item.*View sale/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Current sale' });
    expect(within(sheet).getByRole('button', { name: /1×Cheese Kottu/ })).toBeInTheDocument();
    expect(sheet).toHaveTextContent('LKR 1,210.00');
  });
});

describe('POS-002 Product Search', () => {
  useWideViewport();

  it('opens with F2, adds by keyboard, supports a quantity prefix and stays open', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await screen.findByRole('tab', { name: /Kottu/ });
    await user.keyboard('{F2}');
    const dialog = await screen.findByRole('dialog', { name: 'Product search' });
    const input = within(dialog).getByRole('combobox', { name: 'Product search' });

    // Arrow keys move the active option; Enter adds it.
    await user.type(input, 'kottu');
    expect(within(dialog).getAllByRole('option')).toHaveLength(9);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Added Cheese Kottu ×1');

    // "3*s01" adds three Fish Buns; the dialog is still open for the next item.
    await user.type(input, '3*s01{Enter}');
    expect(within(dialog).getByRole('status')).toHaveTextContent('Added Fish Bun ×3');
    expect(input).toHaveValue('');

    // Category chips narrow the list to that subtree.
    await user.click(within(dialog).getByRole('button', { name: 'Drinks' }));
    const drinks = within(dialog)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(drinks).toHaveLength(13);
    expect(drinks.slice(0, 3)).toEqual([
      expect.stringContaining('Plain Tea'),
      expect.stringContaining('Milk Tea'),
      expect.stringContaining('Iced Coffee'),
    ]);

    await user.click(within(dialog).getAllByRole('button', { name: 'Done' })[0]!);
    expect(within(sale()).getByRole('button', { name: /3×Fish Bun/ })).toBeInTheDocument();
    expect(within(sale()).getByRole('button', { name: /1×Cheese Kottu/ })).toBeInTheDocument();
  });

  it('opens from the inline bar when Enter has several matches, keeping the query', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    const inline = await screen.findByRole('searchbox', { name: 'Search products' });
    await user.type(inline, 'rice{Enter}');
    const dialog = await screen.findByRole('dialog', { name: 'Product search' });
    expect(within(dialog).getByRole('combobox')).toHaveValue('rice');
    expect(within(dialog).getAllByRole('option').length).toBeGreaterThan(1);
  });
});

describe('POS-003 Customer Selector', () => {
  useWideViewport();

  it('finds a customer by phone and shows them (with balance) on the sale', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Walk-in customer/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Customer' });
    // Touch keypad input.
    for (const digit of '0771234567') {
      await user.click(within(dialog).getByRole('button', { name: digit }));
    }
    await user.click(await within(dialog).findByRole('button', { name: 'Select Nimal Perera' }));

    const change = await within(sale()).findByRole('button', {
      name: /Change customer: Nimal Perera/,
    });
    expect(change).toHaveTextContent('077 123 4567');
    expect(await within(change).findByText(/Owes LKR.2,500\.00/)).toBeInTheDocument();

    // Remove → back to walk-in.
    await user.click(within(sale()).getByRole('button', { name: 'Remove customer Nimal Perera' }));
    expect(within(sale()).getByRole('button', { name: /Walk-in customer/ })).toBeInTheDocument();
  });

  it('quick-creates a customer when the phone is unknown, and keeps it on the sale', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Walk-in customer/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Customer' });
    await user.type(within(dialog).getByLabelText('Phone number'), '078 555 1234');
    expect(await within(dialog).findByText('No customer with 078 555 1234')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText(/Customer name/), 'Janani R');
    await user.type(within(dialog).getByLabelText('Address (optional)'), '8 Lake Road, Kandy');
    await user.click(within(dialog).getByRole('button', { name: 'Create & select' }));

    expect(
      await within(sale()).findByRole('button', { name: /Change customer: Janani R/ }),
    ).toHaveTextContent('078 555 1234');
    expect(localStorage.getItem('rbp.pos.carts')).toContain('Janani R');
    const found = await api.customers.list({ phone: '0785551234' });
    expect(found.items[0]).toMatchObject({ name: 'Janani R', address: '8 Lake Road, Kandy' });

    // A delivery for them fills the address from the new record.
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(within(sale()).getByRole('radio', { name: 'Delivery' }));
    const delivery = await screen.findByRole('dialog', { name: 'Delivery details' });
    expect(await within(delivery).findByText('Janani R')).toBeInTheDocument();
    expect(within(delivery).getByLabelText('Address')).toHaveValue('8 Lake Road, Kandy');
  });

  it('finds customers by name as a fallback', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Walk-in customer/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Customer' });
    await user.type(within(dialog).getByLabelText('Or search by name'), 'kavi');
    await user.click(
      await within(dialog).findByRole('button', { name: 'Select Kavitha Sivakumar' }),
    );
    expect(
      await within(sale()).findByRole('button', { name: /Change customer: Kavitha Sivakumar/ }),
    ).toBeInTheDocument();
  });

  it('offers quick create to waiters too (phone and delivery orders)', async () => {
    await openPos('waiter@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Walk-in customer/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Customer' });
    await user.type(within(dialog).getByLabelText('Phone number'), '0785550000');
    expect(
      await within(dialog).findByRole('button', { name: 'Create & select' }),
    ).toBeInTheDocument();
    expect(within(dialog).queryByText(/You can't add customers/)).toBeNull();
  });

  it('clearing the sale removes the customer too', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(screen.getByRole('button', { name: /Walk-in customer/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Customer' });
    await user.type(within(dialog).getByLabelText('Phone number'), '0771234567');
    await user.click(await within(dialog).findByRole('button', { name: 'Select Nimal Perera' }));
    await within(sale()).findByRole('button', { name: /Change customer/ });
    await user.click(within(sale()).getByRole('button', { name: 'Clear' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Clear' }),
    );
    expect(within(sale()).getByRole('button', { name: /Walk-in customer/ })).toBeInTheDocument();
  });
});

async function approveWithPin(
  user: ReturnType<typeof userEvent.setup>,
  pin: string,
  reasonTitle: RegExp,
  reason = 'Manager instruction',
) {
  const pinDialog = await screen.findByRole('dialog', { name: 'Employee verification' });
  for (const digit of pin) await user.click(within(pinDialog).getByRole('button', { name: digit }));
  const reasonDialog = await screen.findByRole('dialog', { name: reasonTitle });
  await user.click(within(reasonDialog).getByRole('radio', { name: reason }));
  await user.click(within(reasonDialog).getByRole('button', { name: 'Confirm' }));
}

describe('POS-004 Discount and POS-005 Charges', () => {
  useWideViewport();

  it('applies a manager-approved bill discount and shows it in the totals', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: /Chicken Kottu/ }),
    );

    await user.click(within(sale()).getByRole('button', { name: /^Discount\s*\(?Needs/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Discount' });
    await user.click(within(dialog).getByRole('button', { name: '10%' }));
    expect(
      within(dialog).getByText(/Discount −LKR.180\.00 · New total LKR.1,782\.00/),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Apply discount' }));
    await approveWithPin(user, '2222', /Why this discount/);

    expect(await screen.findByText('10% discount approved by Suresh Kumar')).toBeInTheDocument();
    // 1,800 − 180 = 1,620 + 10% service 162 = 1,782
    expect(sale()).toHaveTextContent('10% discount−LKR 180.00');
    expect(sale()).toHaveTextContent('Service charge (10%)LKR 162.00');
    expect(sale()).toHaveTextContent('LKR 1,782.00');
  });

  it("refuses a cashier's own PIN at the PIN step and lets a manager take over (SCN-006)", async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(within(sale()).getByRole('button', { name: /^Discount\s*\(?Needs/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Discount' });
    await user.click(within(dialog).getByRole('button', { name: '10%' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apply discount' }));

    const pinDialog = await screen.findByRole('dialog', { name: 'Employee verification' });
    // Context: what's being approved, and that the operator can't approve it.
    expect(pinDialog).toHaveTextContent('Apply discount');
    expect(pinDialog).toHaveTextContent(/Whole bill · −LKR.90\.00/);
    expect(pinDialog).toHaveTextContent("Needs a manager's approval");
    for (const d of '3333') await user.click(within(pinDialog).getByRole('button', { name: d }));
    expect(
      await within(pinDialog).findByText(
        "Fathima Rizvi can't apply discount. Ask a manager to enter their PIN.",
      ),
    ).toBeInTheDocument();
    // No reason was asked for; the manager enters their PIN in the same dialog.
    expect(screen.queryByRole('dialog', { name: /Why this discount/ })).toBeNull();
    for (const d of '2222') await user.click(within(pinDialog).getByRole('button', { name: d }));
    const reason = await screen.findByRole('dialog', { name: /Why this discount/ });
    expect(reason).toHaveTextContent('Approved by Suresh Kumar');
    // Discount-specific reasons only.
    expect(within(reason).getByRole('radio', { name: 'Loyal customer' })).toBeInTheDocument();
    expect(within(reason).queryByRole('radio', { name: 'Cash pickup' })).toBeNull();
  });

  it('discounts one item by an amount and via a promotion', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await tapTile(user, /Short Eats/, /Fish Bun/);
    for (let i = 0; i < 3; i++) {
      await user.click(
        within(screen.getByRole('tabpanel')).getByRole('button', { name: /Fish Bun/ }),
      );
    }
    await user.click(within(sale()).getByRole('button', { name: /4×Fish Bun/ }));
    await user.click(within(sale()).getByRole('button', { name: 'Discount Fish Bun' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discount' });
    expect(within(dialog).getByRole('radio', { name: 'Fish Bun ×4' })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Amount' }));
    await user.click(within(dialog).getByRole('button', { name: '5' }));
    await user.click(within(dialog).getByRole('button', { name: '0' }));
    expect(within(dialog).getByText(/Item now LKR.430\.00/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Apply discount' }));
    await approveWithPin(user, '2222', /Why this discount/);
    const line = await within(sale()).findByRole('button', { name: /4×Fish Bun/ });
    expect(line).toHaveTextContent('LKR 50.00 discount');
    expect(line).toHaveTextContent('LKR 430.00');
    expect(sale()).toHaveTextContent('Item discounts−LKR 50.00');

    // Whole-bill promotion on top.
    await user.click(within(sale()).getByRole('button', { name: /^Discount\s*\(?Needs/ }));
    const again = await screen.findByRole('dialog', { name: 'Discount' });
    await user.click(within(again).getByRole('button', { name: 'Promotion' }));
    await user.click(within(again).getByRole('radio', { name: /Loyalty Rs 100 off/ }));
    await user.click(within(again).getByRole('button', { name: 'Apply discount' }));
    await approveWithPin(user, '2222', /Why this discount/);
    expect(await within(sale()).findByText('Loyalty Rs 100 off')).toBeInTheDocument();
  });

  it('adds a default delivery charge without a PIN and waives service with one', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(within(sale()).getByRole('button', { name: /^Charges\s*\(?Needs/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Charges' });
    await user.click(within(dialog).getByRole('button', { name: /Add LKR.250\.00/ }));
    expect(await screen.findByText('Delivery added')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove Delivery' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Waive' }));
    await approveWithPin(user, '2222', /Why change the charges/);
    expect(await within(dialog).findByText('Waived')).toBeInTheDocument();
    // 900 + delivery 250, no service charge.
    expect(sale()).toHaveTextContent('Service charge (waived)LKR 0.00');
    expect(sale()).toHaveTextContent('DeliveryLKR 250.00');
    expect(sale()).toHaveTextContent('LKR 1,150.00');

    // Changing the rate: the button says so, and an impossible rate says why it's off.
    await user.click(within(dialog).getByRole('button', { name: 'Change rate' }));
    await keypad(user, dialog, '150');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Service charge can be at most 100%',
    );
    expect(within(dialog).getByRole('button', { name: 'Set service charge' })).toBeDisabled();
  });

  it('removes a discount (voided and audited) and clears adjustments with the sale', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(within(sale()).getByRole('button', { name: /^Discount\s*\(?Needs/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Discount' });
    await user.click(within(dialog).getByRole('button', { name: '5%' }));
    await user.click(within(dialog).getByRole('button', { name: 'Apply discount' }));
    await approveWithPin(user, '2222', /Why this discount/);
    await user.click(await within(sale()).findByRole('button', { name: 'Remove 5% discount' }));
    expect(await screen.findByText('5% discount removed')).toBeInTheDocument();
    expect(sale()).toHaveTextContent('LKR 990.00');

    // Add a charge, then clear the sale: the charge is voided server-side too.
    await user.click(within(sale()).getByRole('button', { name: /^Charges\s*\(?Needs/ }));
    const charges = await screen.findByRole('dialog', { name: 'Charges' });
    await user.click(within(charges).getByRole('button', { name: /Add LKR.50\.00/ }));
    await screen.findByText('Packaging added');
    await user.keyboard('{Escape}');
    await user.click(within(sale()).getByRole('button', { name: 'Clear' }));
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Clear' }),
    );
    await within(sale()).findByText('No items yet');

    const { accessToken } = await api.auth.login({
      email: 'owner@pilot.demo',
      password: 'demo1234',
    });
    useSessionStore.getState().signIn(accessToken);
    const voids = (await api.audit.list({ action: 'pos.adjustment.void' })).items;
    expect(voids.map((e) => e.entityLabel?.split(' · ')[0])).toEqual([
      'Removed Packaging',
      'Removed 5% discount',
    ]);
  });
});

describe('POS-006/007 on existing actions', () => {
  useWideViewport();

  it('opens the drawer only after a PIN and a drawer reason, and audits it', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await screen.findByRole('complementary', { name: /Current sale/ });
    await user.click(await within(sale()).findByRole('button', { name: /^Open drawer/ }));
    await approveWithPin(user, '3333', /Why open the drawer/, 'Change for customer');
    expect(await screen.findByText('Cash drawer opened (Fathima Rizvi)')).toBeInTheDocument();

    const { accessToken } = await api.auth.login({
      email: 'owner@pilot.demo',
      password: 'demo1234',
    });
    useSessionStore.getState().signIn(accessToken);
    const [event] = (await api.audit.list({ action: 'pos.drawer.open' })).items;
    expect(event).toMatchObject({ reason: { code: 'CHANGE_FOR_CUSTOMER' } });
  });

  it('changes one item price with PIN + reason, shows it, and can restore it', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Cheese Kottu/);
    await user.click(within(sale()).getByRole('button', { name: /1×Cheese Kottu/ }));
    await user.click(within(sale()).getByRole('button', { name: 'Change price of Cheese Kottu' }));
    const dialog = await screen.findByRole('dialog', { name: 'Change price' });
    for (const d of '950') await user.click(within(dialog).getByRole('button', { name: d }));
    await user.click(within(dialog).getByRole('button', { name: 'Change price' }));

    const pinDialog = await screen.findByRole('dialog', { name: 'Employee verification' });
    for (const d of '2222') await user.click(within(pinDialog).getByRole('button', { name: d }));
    const reason = await screen.findByRole('dialog', { name: /Why change this price/ });
    expect(reason).toHaveTextContent(/LKR.1,100\.00.*LKR.950\.00/);
    await user.click(within(reason).getByRole('radio', { name: 'Price correction' }));
    await user.click(within(reason).getByRole('button', { name: 'Confirm' }));

    const line = await within(sale()).findByRole('button', { name: /1×Cheese Kottu/ });
    expect(line).toHaveTextContent('Price changed');
    expect(line).toHaveTextContent('@ LKR 950.00');
    expect(sale()).toHaveTextContent('SubtotalLKR 950.00');

    // Restoring raises the price back → no PIN needed.
    await user.click(within(sale()).getByRole('button', { name: 'Restore catalog price' }));
    await waitFor(() => expect(sale()).toHaveTextContent('SubtotalLKR 1,100.00'));
  });
});

async function keypad(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  digits: string,
) {
  for (const d of digits) await user.click(within(dialog).getByRole('button', { name: d }));
}

describe('POS-008 → POS-009 → POS-010/011/012', () => {
  useWideViewport();

  it('takes cash with change, shows and prints the receipt, then starts a new sale', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN', 'dev_01');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: /Chicken Kottu/ }),
    );
    // 1,800 + 10% service = 1,980
    await user.click(within(sale()).getByRole('button', { name: /Pay · LKR.1,980\.00/ }));
    const pay = await screen.findByRole('dialog', { name: 'Payment' });
    expect(within(pay).getByRole('button', { name: /Credit sale/ })).toBeDisabled();
    await keypad(user, pay, '2000');
    expect(pay).toHaveTextContent(/Change due.*LKR.20\.00/);
    await user.click(within(pay).getByRole('button', { name: /Take LKR.1,980\.00/ }));

    const receipt = await screen.findByRole('dialog', { name: 'Receipt MAIN-000001' });
    const paper = within(receipt).getByRole('article', { name: 'MAIN-000001' });
    expect(paper).toHaveTextContent('Chicken Kottu');
    expect(paper).toHaveTextContent(/Change due.*LKR.20\.00/);
    expect(paper).toHaveTextContent('Counter POS 1');
    await user.click(within(receipt).getByRole('button', { name: /Print/ }));
    expect(await screen.findByText('Sent to Receipt Printer')).toBeInTheDocument();
    await user.click(within(receipt).getByRole('button', { name: 'New sale' }));
    expect(within(sale()).getByText('No items yet')).toBeInTheDocument();
  });

  it('holds a sale, resumes it, and needs a manager PIN to reduce saved items only', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN', 'dev_01');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: /Chicken Kottu/ }),
    );
    await user.click(within(sale()).getByRole('button', { name: /^Hold/ }));
    const holdDialog = await screen.findByRole('dialog', { name: 'Hold this sale' });
    await user.type(within(holdDialog).getByLabelText('Label (optional)'), 'Table 4');
    await user.click(within(holdDialog).getByRole('button', { name: 'Hold sale' }));
    expect(await screen.findByText('Held as MAIN-000001')).toBeInTheDocument();
    expect(within(sale()).getByText('No items yet')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Held sales (1)' }));
    const held = await screen.findByRole('dialog', { name: 'Held sales' });
    expect(held).toHaveTextContent('Table 4');
    await user.click(within(held).getByRole('button', { name: 'Resume MAIN-000001' }));
    const line = await within(sale()).findByRole('button', { name: /2×Chicken Kottu/ });
    expect(line).toHaveTextContent('Saved');
    expect(within(sale()).getByRole('heading', { name: /Order MAIN-000001/ })).toBeInTheDocument();

    // New item: free to add and remove.
    await tapTile(user, /Short Eats/, /Fish Bun/);
    await user.click(within(sale()).getByRole('button', { name: /1×Fish Bun/ }));
    await user.click(within(sale()).getAllByRole('button', { name: 'Remove Fish Bun' })[0]!);
    expect(within(sale()).queryByRole('button', { name: /Fish Bun/ })).toBeNull();

    // Saved item: reducing asks for a PIN and a reason.
    // Removing Fish Bun moved the selection to the kottu; open it if needed.
    const kottuLine = within(sale()).getByRole('button', { name: /2×Chicken Kottu/ });
    if (kottuLine.getAttribute('aria-expanded') !== 'true') await user.click(kottuLine);
    await user.click(within(sale()).getByRole('button', { name: 'Decrease Chicken Kottu' }));
    const pinDialog = await screen.findByRole('dialog', { name: 'Employee verification' });
    expect(pinDialog).toHaveTextContent('Reduce item quantity');
    await keypad(user, pinDialog, '2222');
    const reason = await screen.findByRole('dialog', { name: /Why reduce Chicken Kottu/ });
    expect(reason).toHaveTextContent(/×2.*×1/);
    await user.click(within(reason).getByRole('radio', { name: 'Customer changed order' }));
    await user.click(within(reason).getByRole('button', { name: 'Confirm' }));
    expect(
      await within(sale()).findByRole('button', { name: /1×Chicken Kottu/ }),
    ).toBeInTheDocument();
  });

  it('returns part of a sale from history and shows the return receipt', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN', 'dev_01');
    const order = await api.orders.create({
      lines: [{ productId: 'prd_01K01', quantity: 2 }],
      adjustmentIds: [],
      status: 'OPEN',
    });
    await api.orders.pay(order.id, { method: 'CARD' });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sales history' }));
    const history = await screen.findByRole('dialog', { name: 'Sales history' });
    await user.click(
      await within(history).findByRole('button', { name: `Return ${order.number}` }),
    );

    const ret = await screen.findByRole('dialog', { name: `Return — ${order.number}` });
    await user.click(await within(ret).findByRole('button', { name: 'Increase Chicken Kottu' }));
    expect(ret).toHaveTextContent(/Refund about LKR.990\.00/);
    await user.click(within(ret).getByRole('button', { name: /Refund LKR.990\.00/ }));
    await approveWithPin(user, '2222', /Why is this being returned/, 'Customer returned item');

    const returnReceipt = await screen.findByRole('dialog', {
      name: 'Return receipt RTN-MAIN-000001',
    });
    expect(returnReceipt).toHaveTextContent(order.number);
    // Method codes print translated, not as raw enum text ("Refund · CARD").
    expect(returnReceipt).toHaveTextContent('Refund · Card');
  });

  it("voids today's sale from history with a manager PIN", async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN', 'dev_01');
    const order = await api.orders.create({
      lines: [{ productId: 'prd_01S01', quantity: 3 }],
      adjustmentIds: [],
      status: 'OPEN',
    });
    await api.orders.pay(order.id, {
      method: 'CASH',
      tendered: { amount: 50000, currency: 'LKR' },
    });
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sales history' }));
    const history = await screen.findByRole('dialog', { name: 'Sales history' });
    await user.click(await within(history).findByRole('button', { name: `Void ${order.number}` }));
    await approveWithPin(user, '2222', new RegExp(`Why void ${order.number}`), 'Duplicate sale');
    expect(await screen.findByText(new RegExp(`${order.number} voided`))).toBeInTheDocument();
    expect(
      await within(history).findByText(/Voided by Suresh Kumar · Duplicate sale/),
    ).toBeInTheDocument();
  });

  it('cancels a resumed held order with PIN + reason', async () => {
    await openPos('cashier@pilot.demo', 'loc_01MAIN', 'dev_01');
    const held = await api.orders.create({
      lines: [{ productId: 'prd_01D02', quantity: 2 }],
      adjustmentIds: [],
      status: 'HELD',
    });
    // Made outside the UI after the POS loaded: refresh rather than race the refetch.
    await queryClient.invalidateQueries();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole('button', { name: 'Held sales (1)' }, { timeout: 5000 }),
    );
    await user.click(await screen.findByRole('button', { name: `Resume ${held.number}` }));
    await user.click(await within(sale()).findByRole('button', { name: 'Cancel sale' }));
    await approveWithPin(
      user,
      '2222',
      new RegExp(`Why cancel ${held.number}`),
      'Customer changed order',
    );
    expect(await screen.findByText(`${held.number} cancelled`)).toBeInTheDocument();
    expect(within(sale()).getByText('No items yet')).toBeInTheDocument();
    expect((await api.orders.get(held.id)).status).toBe('CANCELLED');
  });
});

describe('REST-002 kitchen count and cancelling sent food', () => {
  useWideViewport();

  it('counts only items with a kitchen station and asks what happens to sent food on cancel', async () => {
    await openPos('waiter@pilot.demo', 'loc_01MAIN', 'dev_02');
    const user = userEvent.setup();
    const panel = await screen.findByRole('complementary', { name: /Current sale/ });
    await user.click(await within(panel).findByRole('radio', { name: 'Dine-in' }));
    const tables = await screen.findByRole('dialog', { name: 'Tables' });
    await user.click(await within(tables).findByRole('button', { name: 'Table T4 · Free' }));
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    // Fish Bun has no kitchen station: it never goes out on a KOT.
    await tapTile(user, /Short Eats/, /Fish Bun/);
    await user.click(
      within(screen.getByRole('tabpanel')).getByRole('button', { name: /Fish Bun/ }),
    );
    expect(within(sale()).getByRole('button', { name: /2×Fish Bun/ })).not.toHaveTextContent(
      'Not sent',
    );
    await user.click(within(sale()).getByRole('button', { name: 'Send 1 to kitchen' }));
    expect(await screen.findByText(/^1 item sent · KOT-/)).toBeInTheDocument();
    expect(within(sale()).getByRole('button', { name: 'All sent' })).toBeDisabled();

    // A-230: cancelling the whole order asks for a disposition before the PIN.
    await user.click(within(sale()).getByRole('button', { name: 'Cancel sale' }));
    const disposition = await screen.findByRole('dialog', {
      name: /^1 item from \S+ is already in the kitchen$/,
    });
    await user.click(within(disposition).getByRole('radio', { name: /Wastage/ }));
    await user.click(within(disposition).getByRole('button', { name: 'Continue' }));
    await approveWithPin(user, '2222', /Why cancel/, 'Customer changed order');
    await waitFor(() => expect(within(sale()).getByText('No items yet')).toBeInTheDocument());
    const cancel = (await api.kots.list()).find((k) => k.kind === 'CANCEL');
    expect(cancel?.items).toEqual([
      expect.objectContaining({ name: 'Chicken Kottu', quantity: 1, disposition: 'WASTAGE' }),
    ]);
  });
});
