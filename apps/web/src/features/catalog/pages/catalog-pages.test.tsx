import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { routes } from '@/app/router';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function openAs(email: string, path: string, locationId = 'loc_01MAIN') {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(locationId);
  queryClient.clear();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, user: userEvent.setup() };
}

async function enterPin(user: ReturnType<typeof userEvent.setup>, pin: string) {
  const dialog = await screen.findByRole('dialog', { name: 'Employee verification' });
  for (const digit of pin) await user.click(within(dialog).getByRole('button', { name: digit }));
}

describe('P1 catalog screens', () => {
  it('CAT-001/002: creates a subcategory from the row menu and shows it in the tree', async () => {
    const { user, router } = await openAs('owner@pilot.demo', '/catalog/categories');
    // jsdom reports a narrow viewport, so DataTable renders its mobile cards.
    await user.click(
      await screen.findByRole('button', { name: 'More actions for Short Eats' }, { timeout: 5000 }),
    );
    await user.click(await screen.findByRole('menuitem', { name: 'Add subcategory' }));

    await screen.findByRole('heading', { name: 'New category' }, { timeout: 5000 });
    await user.type(screen.getByLabelText(/^Name(?! \()/), 'Rolls');
    await user.type(screen.getByLabelText(/^Code/), 'rolls');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Category Rolls created')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/catalog/categories');
    expect(await screen.findByText('ROLLS')).toBeInTheDocument();
    const tree = await api.catalog.categories.tree();
    expect(tree.find((c) => c.code === 'ROLLS')).toMatchObject({
      parentId: 'cat_01SHORT',
      path: ['Short Eats'],
    });
  });

  it('CAT-004: puts a server-side duplicate-code error on the Code field', async () => {
    const { user } = await openAs('owner@pilot.demo', '/catalog/products/new');
    await user.type(
      await screen.findByLabelText(/^Name(?! \()/, {}, { timeout: 5000 }),
      'Another Fish Bun',
    );
    await user.type(screen.getByLabelText(/^Code/), 's01');
    await user.click(screen.getByRole('combobox', { name: /Category/ }));
    await user.click(await screen.findByRole('option', { name: /Short Eats/ }));
    await user.type(screen.getByLabelText(/^Base price/), '130');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('This code is already used by another item'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Code/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('CAT-004: shows a zero base price error under the field and in the summary', async () => {
    const { user } = await openAs('owner@pilot.demo', '/catalog/products/new');
    await user.type(await screen.findByLabelText(/^Base price/, {}, { timeout: 5000 }), '0');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    const summary = await screen.findByText('Please fix the following:');
    expect(summary.parentElement).toHaveTextContent('Base price: Price must be more than zero');
    expect(screen.getAllByText(/Price must be more than zero/)).toHaveLength(2);
    expect(screen.getByLabelText(/^Base price/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('CAT-004: puts a server-side duplicate-barcode error on the Barcodes field', async () => {
    const { user } = await openAs('owner@pilot.demo', '/catalog/products/new');
    await user.type(await screen.findByLabelText(/^Name(?! \()/, {}, { timeout: 5000 }), 'Mango');
    await user.type(screen.getByLabelText(/^Code/), 'j01');
    await user.click(screen.getByRole('combobox', { name: /Category/ }));
    await user.click(await screen.findByRole('option', { name: /Short Eats/ }));
    await user.type(screen.getByLabelText(/^Base price/), '250');
    await user.type(screen.getByLabelText(/^Barcodes/), '4790001000123{Enter}');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findAllByText(/This barcode is already used by another product/),
    ).toHaveLength(2); // field message + summary
    expect(screen.getByLabelText(/^Barcodes/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('CAT-006: lowering a price asks for a manager PIN and reason, then shows in recent changes', async () => {
    const { user } = await openAs('manager@pilot.demo', '/catalog/pricing?q=R01');
    const cell = await screen.findByRole('textbox', {
      name: 'Chicken Rice & Curry · Main Restaurant',
    });
    await user.type(cell, '700');
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await enterPin(user, '2222');
    const reason = await screen.findByRole('dialog', { name: 'Why are prices being lowered?' });
    await user.click(within(reason).getByRole('radio', { name: 'Price correction' }));
    await user.click(within(reason).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('1 price updated')).toBeInTheDocument();
    const recent = await screen.findByText('Chicken Rice & Curry · Main Restaurant');
    const item = recent.closest('li')!;
    await waitFor(() => expect(item).toHaveTextContent('PIN: Suresh Kumar'));
    expect(item).toHaveTextContent('Price correction');
  });

  it('CAT-007: reordering with move buttons is saved and followed by the POS', async () => {
    const { user } = await openAs('owner@pilot.demo', '/catalog/quick-pad');
    await screen.findByRole('list', { name: 'Categories' });
    await user.click(screen.getByRole('button', { name: 'Move Drinks up' }));
    await user.click(screen.getByRole('button', { name: 'Move Drinks up' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Quick Pad saved for Main Restaurant')).toBeInTheDocument();

    const layout = await api.catalog.quickPad.get('loc_01MAIN');
    const topLevel = layout.categoryOrder.filter((id) =>
      ['cat_01RICE', 'cat_01KOTTU', 'cat_01SHORT', 'cat_01BAKERY', 'cat_01DRINKS'].includes(id),
    );
    expect(topLevel).toEqual([
      'cat_01RICE',
      'cat_01KOTTU',
      'cat_01DRINKS',
      'cat_01SHORT',
      'cat_01BAKERY',
    ]);
  });

  it('CAT-005: switching a product on for a location makes it sellable there', async () => {
    const { user } = await openAs(
      'manager@pilot.demo',
      '/catalog/location-products?location=loc_01BAKERY&sold=no',
    );
    const toggle = await screen.findByRole('switch', { name: 'Sold here: Chicken Kottu' });
    await user.click(toggle);
    expect(
      await screen.findByText('Chicken Kottu is now sold at Bakery Outlet'),
    ).toBeInTheDocument();
    const sold = await api.catalog.locationProducts.list({ locationId: 'loc_01BAKERY' });
    expect(sold.some((p) => p.code === 'K01')).toBe(true);
  });

  it('keeps catalog management screens behind catalog.manage (SCN-006)', async () => {
    await openAs('cashier@pilot.demo', '/catalog/pricing');
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });
});
