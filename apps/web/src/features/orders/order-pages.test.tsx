import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { routes } from '@/app/router';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signInAs(email: string, locationId = 'loc_01MAIN') {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation(locationId);
  useSessionStore.getState().setDevice(null);
  queryClient.clear();
}

function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, user: userEvent.setup() };
}

/** 2 × Chicken Kottu + 3 × Fish Bun, paid in cash today. */
async function paidSale() {
  const order = await api.orders.create({
    lines: [
      { productId: 'prd_01K01', quantity: 2 },
      { productId: 'prd_01S01', quantity: 3 },
    ],
    adjustmentIds: [],
    status: 'OPEN',
  });
  return api.orders.pay(order.id, {
    method: 'CASH',
    tendered: { amount: 300_000, currency: 'LKR' },
  });
}

describe('SAL-001 Orders', () => {
  it("lists today's sales and filters the seeded history by status", async () => {
    await signInAs('manager@pilot.demo');
    const sale = await paidSale();
    const { user, router } = open('/sales/orders');
    // jsdom is narrow: DataTable renders cards, each a button named after the row.
    expect(
      await screen.findByRole('button', { name: `${sale.number} Paid` }, { timeout: 5000 }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Date range' }));
    await user.click(await screen.findByRole('option', { name: 'Last 30 days' }));
    await user.click(screen.getByRole('button', { name: 'Voided' }));
    await waitFor(() => expect(router.state.location.search).toBe('?range=month&status=VOIDED'));
    const rows = await screen.findAllByRole(
      'button',
      { name: /^HX-MAIN-\S+ Voided$/ },
      { timeout: 5000 },
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: `${sale.number} Paid` })).not.toBeInTheDocument();
  });

  it('opens an order and voids it with a manager PIN', async () => {
    await signInAs('cashier@pilot.demo');
    const sale = await paidSale();
    const { user, router } = open('/sales/orders');
    await user.click(
      await screen.findByRole('button', { name: `${sale.number} Paid` }, { timeout: 5000 }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`/sales/orders/${sale.id}`));
    expect(
      await screen.findByRole('heading', { name: new RegExp(sale.number) }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('Chicken Kottu')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Payments' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Void sale/ }));
    const pinDialog = await screen.findByRole('dialog', { name: 'Employee verification' });
    for (const d of '2222') await user.click(within(pinDialog).getByRole('button', { name: d }));
    const reasonDialog = await screen.findByRole('dialog', { name: /Why void/ });
    await user.click(within(reasonDialog).getByRole('radio', { name: 'Manager instruction' }));
    await user.click(within(reasonDialog).getByRole('button', { name: 'Confirm' }));

    expect(
      await screen.findByText(/Voided by Suresh Kumar/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect((await api.orders.get(sale.id)).status).toBe('VOIDED');
  });

  it("can't void an older sale and offers a return instead", async () => {
    await signInAs('manager@pilot.demo');
    const old = (
      await api.orders.list({ status: 'PAID', search: 'HX-MAIN', pageSize: 100 })
    ).items.find(
      (o) =>
        !o.returns.length && new Date(o.createdAt).toDateString() !== new Date().toDateString(),
    )!;
    open(`/sales/orders/${old.id}`);
    expect(
      await screen.findByText(/Only today's sales can be voided/, {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Void sale/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Return items/ })).toBeEnabled();
  });
});
