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

async function openAs(email: string, path: string, locationId = 'loc_01VAN1') {
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

const LAKSHMI = 'shp_001';
const owed = async () => (await api.wholesale.shops.get(LAKSHMI)).outstanding.amount;

describe('FLOW-WHO-001 shop → products → invoice → payment/credit → share', () => {
  it('sells from the van, warns over the limit and shares the invoice', async () => {
    const { user, router } = await openAs('rep@pilot.demo', '/wholesale/field-sales');
    await user.click(
      await screen.findByRole('button', { name: /^Lakshmi Stores/ }, { timeout: 5000 }),
    );
    const before = await owed();

    await user.type(
      await screen.findByRole('spinbutton', { name: 'Quantity of Sandwich Bread (450g)' }),
      '10',
    );
    await user.type(screen.getByRole('spinbutton', { name: 'Quantity of Fish Bun' }), '20');
    expect(screen.getByText('30 items')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Review/ }));

    await user.type(screen.getByRole('textbox', { name: 'Paid now' }), '1000');
    // 3,700 − 1,000 = 2,700 on credit takes Lakshmi (24,660 of 25,000) over.
    expect(
      await screen.findByText('This takes the shop over its credit limit'),
    ).toBeInTheDocument();
    const create = screen.getByRole('button', { name: /Create invoice/ });
    expect(create).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Continue anyway' }));
    await user.click(create);

    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/wholesale\/field-sales\/win_/),
    );
    expect(await owed()).toBe(before + 270_000);
    expect(await screen.findByText('Sold over the credit limit')).toBeInTheDocument();
    const whatsapp = screen.getByRole('link', { name: /WhatsApp/ });
    expect(whatsapp.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/94771100101\?text=/);
    await user.click(whatsapp);
    await user.click(screen.getByRole('button', { name: /^Print$/ }));
    const id = router.state.location.pathname.split('/').pop()!;
    await waitFor(async () => {
      const inv = await api.wholesale.invoices.get(id);
      expect(inv.shares.map((s) => s.channel)).toEqual(['WHATSAPP']);
      expect(inv.prints).toHaveLength(1);
    });
  }, 30_000);
});

describe('WHO-004 / WHO-005 collection and return', () => {
  it('collects from the shop page', async () => {
    const { user } = await openAs('rep@pilot.demo', `/customers/external-shops/${LAKSHMI}`);
    const before = await owed();
    await user.click(
      await screen.findByRole('button', { name: /Collect payment/ }, { timeout: 5000 }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Collect from Lakshmi Stores' });
    const amount = within(dialog).getByRole('textbox', { name: 'Amount' });
    await user.clear(amount);
    await user.type(amount, '5000');
    await user.click(within(dialog).getByRole('button', { name: /^Collect/ }));
    await waitFor(async () => expect(await owed()).toBe(before - 500_000));
  }, 20_000);

  it('takes expired goods back against an invoice with the rep PIN', async () => {
    const { accessToken } = await api.auth.login({ email: 'rep@pilot.demo', password: 'demo1234' });
    useSessionStore.getState().signIn(accessToken);
    const [invoice] = await api.wholesale.invoices.list({ shopId: LAKSHMI });
    const { user, router } = await openAs(
      'rep@pilot.demo',
      `/wholesale/returns/new?shop=${LAKSHMI}&invoice=${invoice!.id}`,
    );
    const before = await owed();
    const line = invoice!.lines[0]!;
    await user.type(
      await screen.findByRole('spinbutton', { name: `Returned ${line.name}` }, { timeout: 5000 }),
      '2',
    );
    await user.click(screen.getByRole('combobox', { name: `Condition of ${line.name}` }));
    await user.click(await screen.findByRole('option', { name: 'Expired' }));
    expect(await screen.findByText(/2 items aren't resellable/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Record return/ }));

    const pin = await screen.findByRole('dialog', { name: 'Employee verification' });
    await keypad(user, pin, '7777');
    const reason = await screen.findByRole('dialog', {
      name: 'Why is Lakshmi Stores returning goods?',
    });
    await user.click(within(reason).getByRole('radio', { name: 'Expired' }));
    await user.click(within(reason).getByRole('button', { name: 'Confirm' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toMatch(/^\/wholesale\/returns\/wrn_/),
    );
    expect(await owed()).toBe(before - 2 * line.unitPrice.amount);
    expect(await screen.findByText('Stock movements')).toBeInTheDocument();
  }, 30_000);
});

describe('WHO-006 route overview', () => {
  it("shows today's stops in order with the van's stock", async () => {
    // Route A runs Sun/Mon/Wed/Fri, Route B Tue/Thu/Sat (wholesale seed), so today's stops vary.
    const routeB = [2, 4, 6].includes(new Date().getDay());
    const [first, second, secondId] = routeB
      ? ['Coast Bakery Corner', 'Sea View Stores', 'shp_006']
      : ['Lakshmi Stores', 'Perera Grocery', 'shp_002'];
    await openAs('rep@pilot.demo', '/wholesale/routes');
    expect(await screen.findByRole('link', { name: first }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('On Van 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Sell to ${second}` })).toHaveAttribute(
      'href',
      `/wholesale/field-sales?shop=${secondId}`,
    );
  });
});
