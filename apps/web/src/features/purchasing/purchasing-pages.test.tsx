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

const onHand = async (productId: string, locationId: string) =>
  (await api.inventory.get(productId)).levels.find((l) => l.locationId === locationId)?.onHand;

describe('PUR-001/002 suppliers', () => {
  it('lists suppliers and opens one with its orders and deliveries', async () => {
    const { user, router } = await openAs('owner@pilot.demo', '/purchasing/suppliers');
    // jsdom is narrow: DataTable renders cards, each a button named after the row.
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Galle Road Short Eats (Pvt) Ltd' },
        { timeout: 5000 },
      ),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/purchasing/suppliers/sup_02'),
    );
    expect(
      await screen.findByRole('heading', { name: /Galle Road Short Eats/ }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^PO-000004 / })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: /^GRN-000002 / })).toBeInTheDocument();
  });
});

describe('PUR-004 receiving (order → delivery → stock)', () => {
  it('receives an overdue order in full and the stock goes up', async () => {
    const { user, router } = await openAs('manager@pilot.demo', '/purchasing/receiving');
    const pastry = (await onHand('prd_01S05', 'loc_01MAIN')) ?? 0;
    await user.click(
      await screen.findByRole('link', { name: 'Receive PO-000004' }, { timeout: 5000 }),
    );
    await screen.findByRole('heading', { name: 'Receive PO-000004' }, { timeout: 5000 });
    // Defaults to everything still to come: 40 pastries + 50 roti.
    const submit = await screen.findByRole('button', { name: 'Receive 90 units' });
    await user.click(submit);

    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/purchasing\/receiving\/grn_/),
    );
    expect(await screen.findByRole('heading', { name: 'GRN-000003' })).toBeInTheDocument();
    expect(await onHand('prd_01S05', 'loc_01MAIN')).toBe(pastry + 40);
    expect((await api.purchaseOrders.get('po_seed_4')).status).toBe('RECEIVED');
  }, 15_000);

  it('receives part of an order and keeps the rest on order', async () => {
    const { user } = await openAs('owner@pilot.demo', '/purchasing/receiving/new?po=po_seed_3');
    const cutlets = await screen.findByRole(
      'spinbutton',
      { name: 'Received now: Fish Cutlet' },
      { timeout: 5000 },
    );
    // 30 still to come; take 10 now.
    await user.clear(cutlets);
    await user.type(cutlets, '10');
    expect(await screen.findByText('20 units stay on order.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Receive 10 units' }));
    await screen.findByRole('heading', { name: /^GRN-/ }, { timeout: 5000 });
    const po = await api.purchaseOrders.get('po_seed_3');
    expect(po.status).toBe('PARTIALLY_RECEIVED');
    expect(po.lines.find((l) => l.productId === 'prd_01S04')?.receivedQuantity).toBe(30);
  }, 15_000);
});

describe('PUR-003 purchase order', () => {
  it('shows a draft with Place order, and places it', async () => {
    const { user } = await openAs(
      'owner@pilot.demo',
      '/purchasing/orders/po_seed_6',
      'loc_01STORE',
    );
    const place = await screen.findByRole('button', { name: 'Place order' }, { timeout: 5000 });
    expect(screen.getByText('Draft — not sent yet')).toBeInTheDocument();
    await user.click(place);
    expect(
      await screen.findByRole('link', { name: 'Receive goods' }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect((await api.purchaseOrders.get('po_seed_6')).status).toBe('ORDERED');
  });

  it('says an inactive supplier from the link is inactive instead of preselecting it', async () => {
    await openAs('owner@pilot.demo', '/purchasing/orders/new?supplierId=sup_05');
    expect(
      await screen.findByText(
        /Colombo Packaging Co\. is inactive, so you can't order from them/,
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open supplier' })).toHaveAttribute(
      'href',
      '/purchasing/suppliers/sup_05',
    );
    expect(screen.getByRole('combobox', { name: /Supplier/ })).toHaveTextContent(
      'Choose a supplier',
    );
  });

  it('explains an inactive supplier when placing a draft, not "changed by someone else"', async () => {
    const { user } = await openAs(
      'owner@pilot.demo',
      '/purchasing/orders/po_seed_6',
      'loc_01STORE',
    );
    await api.suppliers.setActive('sup_01', false);
    await user.click(await screen.findByRole('button', { name: 'Place order' }, { timeout: 5000 }));
    expect(
      await screen.findByText(
        'This supplier is inactive. Choose another supplier or reactivate this one.',
      ),
    ).toBeInTheDocument();
    await api.suppliers.setActive('sup_01', true);
  });

  it('needs a cancel reason: a short one shows the error instead of doing nothing', async () => {
    const { user } = await openAs(
      'owner@pilot.demo',
      '/purchasing/orders/po_seed_6',
      'loc_01STORE',
    );
    await user.click(
      await screen.findByRole('button', { name: 'Cancel order' }, { timeout: 5000 }),
    );
    const confirm = await screen.findByRole('alertdialog');
    await user.type(within(confirm).getByRole('textbox'), 'no');
    await user.click(within(confirm).getByRole('button', { name: 'Cancel order' }));
    expect(within(confirm).getByRole('alert')).toHaveTextContent('Say why the order is cancelled');
    expect(within(confirm).getByRole('textbox')).toHaveAttribute('aria-invalid', 'true');
    expect((await api.purchaseOrders.get('po_seed_6')).status).toBe('DRAFT');
  });

  it('is not available to a cashier', async () => {
    await openAs('cashier@pilot.demo', '/purchasing/orders');
    const main = await screen.findByRole('main', {}, { timeout: 5000 });
    await waitFor(() =>
      expect(within(main).queryByRole('heading', { name: 'Purchase orders' })).toBeNull(),
    );
  });
});
