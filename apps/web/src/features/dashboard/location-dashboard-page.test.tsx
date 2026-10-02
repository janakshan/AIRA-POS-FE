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

describe('DASH-002 location dashboard', () => {
  it('shows a card per location and opens one location’s dashboard', async () => {
    const { router, user } = await openAs('owner@pilot.demo', '/dashboard/locations');
    const main = await screen.findByRole('region', { name: 'Main Restaurant' }, { timeout: 5000 });
    const bakery = screen.getByRole('region', { name: 'Bakery Outlet' });
    expect(screen.getByRole('region', { name: 'Central Store' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Van 1' })).toBeInTheDocument();

    expect(within(main).getByText('Current')).toBeInTheDocument();
    expect(within(main).getByText('Open tables')).toBeInTheDocument();
    expect(within(bakery).queryByText('Open tables')).toBeNull();

    await user.click(within(bakery).getByRole('button', { name: /Open dashboard/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(useSessionStore.getState().locationId).toBe('loc_01BAKERY');
    expect(await screen.findByText(/Bakery Outlet · today/)).toBeInTheDocument();
  });

  it('links from the main dashboard for a multi-location user', async () => {
    const { router, user } = await openAs('owner@pilot.demo', '/');
    await screen.findByText('Sales today', undefined, { timeout: 5000 });
    // Both the sidebar and the page header offer it.
    const links = screen.getAllByRole('link', { name: /All locations/ });
    expect(links).toHaveLength(2);
    await user.click(links[1]!);
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard/locations'));
  }, 10_000);

  it('hides the link from a single-location cashier and refuses the page', async () => {
    await openAs('cashier@pilot.demo', '/dashboard/locations');
    expect(
      await screen.findByText('Access denied', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /All locations/ })).toBeNull();
  });
});
