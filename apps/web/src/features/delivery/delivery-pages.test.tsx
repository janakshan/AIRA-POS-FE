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

const statusOf = async (number: string) =>
  (await api.deliveries.list()).find((o) => o.number === number)!.delivery!.status;

describe('FLOW-DEL-001 on DEL-001 (dispatcher)', () => {
  it('confirms, sends to the kitchen, marks ready and assigns a rider', async () => {
    const { user } = await openAs('cashier@pilot.demo', '/sales/deliveries');
    const n = 'PH-MAIN-0001';
    await user.click(
      await screen.findByRole('button', { name: `Confirm: ${n}` }, { timeout: 5000 }),
    );
    await user.click(await screen.findByRole('button', { name: `Send to kitchen: ${n}` }));
    await user.click(await screen.findByRole('button', { name: `Mark ready: ${n}` }));
    await waitFor(async () => expect(await statusOf(n)).toBe('READY'));
    // Can't leave without a rider: the assign button leads.
    expect(screen.queryByRole('button', { name: `Out for delivery: ${n}` })).toBeNull();
    await user.click(screen.getByRole('button', { name: `Assign a rider to ${n}` }));
    const dialog = await screen.findByRole('dialog', { name: `Rider for ${n}` });
    await user.click(within(dialog).getByRole('radio', { name: /Sameera Bandara/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Assign' }));
    expect(
      await screen.findByRole('button', { name: `Out for delivery: ${n}` }),
    ).toBeInTheDocument();
  }, 30_000);
});

describe('DEL-002/004 (rider)', () => {
  it('sees only their deliveries and collects cash on delivery', async () => {
    const { user } = await openAs('rider@pilot.demo', '/sales/deliveries');
    expect(
      await screen.findByText('My deliveries', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByText('PH-MAIN-0001')).toBeNull();
    await user.click(await screen.findByRole('link', { name: 'PH-MAIN-0004' }));
    expect(await screen.findByText('Gate code 2468')).toBeInTheDocument();
    expect(screen.getByText('Delivery charge')).toBeInTheDocument();
    expect(screen.getByText(/Collect .* on delivery/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delivered: PH-MAIN-0004' }));
    const dialog = await screen.findByRole('dialog', { name: 'Collect payment · PH-MAIN-0004' });
    await user.click(within(dialog).getByRole('button', { name: 'Paid · delivered' }));
    await waitFor(async () => expect(await statusOf('PH-MAIN-0004')).toBe('DELIVERED'));
  }, 30_000);

  it('gets the standard 403 page for another rider’s delivery', async () => {
    const { accessToken } = await api.auth.login({
      email: 'cashier@pilot.demo',
      password: 'demo1234',
    });
    useSessionStore.getState().signIn(accessToken);
    useSessionStore.getState().setLocation('loc_01MAIN');
    const other = (await api.deliveries.list()).find((o) => o.number === 'PH-MAIN-0001')!;

    await openAs('rider@pilot.demo', `/sales/deliveries/${other.id}`);
    expect(await screen.findByText('Access denied', undefined, { timeout: 5000 })).toBeVisible();
    expect(screen.getByText(/assigned to another rider/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});
