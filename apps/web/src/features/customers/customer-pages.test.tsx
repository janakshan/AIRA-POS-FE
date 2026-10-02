import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { routes } from '@/app/router';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function openAs(email: string, path: string) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation('loc_01MAIN');
  queryClient.clear();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { router, user: userEvent.setup() };
}

// jsdom is narrow, so DataTable renders mobile cards: each row is a button named after the customer.
const row = (name: string) => screen.findByRole('button', { name }, { timeout: 5000 });

describe('CUS-001 customer list', () => {
  it('searches, filters by balance and offers to create a customer from an unknown number', async () => {
    const { user, router } = await openAs('manager@pilot.demo', '/customers');
    await row('Nimal Perera');
    expect(screen.getByText('Total outstanding').closest('[data-slot=card]')).toHaveTextContent(
      /22,100\.00.*3 customers owe/,
    );

    await user.click(screen.getByRole('button', { name: 'Owes money' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Kavitha Sivakumar' })).toBeNull(),
    );
    expect(screen.getByRole('button', { name: 'Anjali Kumari' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Owes money' }));

    await user.type(screen.getByRole('searchbox', { name: 'Search customers' }), '0785550099');
    await user.click(await screen.findByRole('link', { name: /Create customer with this number/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/customers/new'));
    expect(await screen.findByLabelText(/Phone 1/)).toHaveValue('0785550099');
  });
});

describe('CUS-002 customer form', () => {
  it('saves a customer with two numbers and a separate delivery address', async () => {
    const { user, router } = await openAs('manager@pilot.demo', '/customers/new');
    await user.type(await screen.findByLabelText(/^Name/), 'Harini Mohan');
    await user.type(screen.getByLabelText(/Phone 1/), '0781112233');
    await user.click(screen.getByRole('button', { name: 'Add another number' }));
    await user.type(screen.getByLabelText(/Phone 2/), '0781112234');
    await user.click(screen.getByRole('radio', { name: 'Make phone 2 primary' }));
    await user.type(screen.getByLabelText(/^Address/), '3 Sea Street, Colombo 11');
    await user.click(screen.getByRole('checkbox', { name: 'Deliver to the same address' }));
    await user.type(screen.getByLabelText('Delivery address'), '9 Beach Road, Negombo');
    await user.click(screen.getByRole('button', { name: 'Save customer' }));

    expect(await screen.findByText('Harini Mohan added')).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/customers\/cus_/));
    const saved = (await api.customers.list({ phone: '0781112233' })).items[0]!;
    expect(saved).toMatchObject({
      phones: [
        { number: '+94781112234', primary: true },
        { number: '+94781112233', primary: false },
      ],
      address: '3 Sea Street, Colombo 11',
      deliveryAddress: '9 Beach Road, Negombo',
    });
    expect(await screen.findByText('9 Beach Road, Negombo')).toBeInTheDocument();
  });

  it('points at the customer who already has the number, and guards unsaved edits', async () => {
    const { user } = await openAs('manager@pilot.demo', '/customers/cus_03/edit');
    const phone = await screen.findByLabelText(/Phone 1/);
    await user.clear(phone);
    await user.type(phone, '0771234567');
    await user.click(screen.getByRole('button', { name: 'Save customer' }));
    expect(
      await screen.findByText('This number already belongs to Nimal Perera'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Nimal Perera' })).toHaveAttribute(
      'href',
      '/customers/cus_01',
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    const confirm = await screen.findByRole('alertdialog', { name: 'Leave without saving?' });
    await user.click(within(confirm).getByRole('button', { name: 'Stay' }));
    expect(screen.getByLabelText(/Phone 1/)).toHaveValue('0771234567');

    // A unique number clears the warning even when the form then fails validation elsewhere.
    await user.clear(phone);
    await user.type(phone, '0781119999');
    await user.clear(screen.getByLabelText(/^Name/));
    await user.click(screen.getByRole('button', { name: 'Save customer' }));
    await waitFor(() =>
      expect(screen.queryByText('This number already belongs to Nimal Perera')).toBeNull(),
    );
  });

  it('is not available to waiters', async () => {
    await openAs('waiter@pilot.demo', '/customers/new');
    expect(await screen.findByText('Access denied', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save customer' })).toBeNull();
  });
});

describe('CUS-003/004 detail and order history', () => {
  it('shows contact details, purchase stats and orders from every location', async () => {
    const { user, router } = await openAs('manager@pilot.demo', '/customers/cus_01');
    expect(await screen.findByRole('heading', { name: /Nimal Perera/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '077 123 4567' })).toHaveAttribute(
      'href',
      'tel:+94771234567',
    );
    expect(screen.getByText('Orders').closest('[data-slot=card]')).toHaveTextContent('3');
    const recent = await screen.findAllByRole('button', { name: /^Open order OLD-/ });
    expect(recent).toHaveLength(3);
    expect(screen.getByText(/Bakery Outlet/)).toBeInTheDocument();

    await user.click(recent[0]!);
    const dialog = await screen.findByRole('dialog', { name: /^Order OLD-/ });
    expect(dialog).toHaveTextContent('Paid');
    expect(dialog).toHaveTextContent('Total');
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]!);

    await user.click(screen.getByRole('link', { name: 'Order history' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/customers/cus_01/orders'));
    expect(await screen.findAllByRole('button', { name: /^Open order OLD-/ })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Voided' }));
    expect(await screen.findByText('No orders yet')).toBeInTheDocument();
  });
});

describe('CUS-005 outstanding balance', () => {
  it('shows the statement and takes a payment on account', async () => {
    const { user } = await openAs('manager@pilot.demo', '/customers/cus_09/balance');
    expect(await screen.findByText('Current balance')).toBeInTheDocument();
    expect(screen.getByText('Current balance').parentElement).toHaveTextContent('18,750.00');
    expect(await screen.findByText('Brought forward (previous system)')).toBeInTheDocument();
    expect(screen.getAllByText('Credit sale')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Receive payment' }));
    const dialog = await screen.findByRole('dialog', { name: /Payment from Colombo Tech Park/ });
    for (const key of '5000') await user.click(within(dialog).getByRole('button', { name: key }));
    expect(dialog).toHaveTextContent('13,750.00');
    await user.click(within(dialog).getByRole('button', { name: /^Receive LKR/ }));

    expect(await screen.findByText(/PAY-000001 · .*5,000\.00 received/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText('Current balance').parentElement).toHaveTextContent('13,750.00'),
    );
    expect(await screen.findByText('PAY-000001')).toBeInTheDocument();
  });

  it('won’t take more than is owed, and hides the action from staff who can’t take money', async () => {
    const { user } = await openAs('manager@pilot.demo', '/customers/cus_04/balance');
    await user.click(await screen.findByRole('button', { name: 'Receive payment' }));
    const dialog = await screen.findByRole('dialog', { name: /Payment from Anjali/ });
    for (const key of '900') await user.click(within(dialog).getByRole('button', { name: key }));
    expect(dialog).toHaveTextContent('More than the customer owes');
    expect(within(dialog).getByRole('button', { name: /^Receive LKR/ })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Full balance' }));
    expect(within(dialog).getByRole('button', { name: /^Receive LKR/ })).toBeEnabled();
  });

  it('hides Receive payment from waiters', async () => {
    await openAs('waiter@pilot.demo', '/customers/cus_09/balance');
    await screen.findByText('Current balance');
    expect(screen.queryByRole('button', { name: 'Receive payment' })).toBeNull();
  });
});
