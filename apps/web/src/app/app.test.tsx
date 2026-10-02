import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockConfig } from '@/mocks/config';
import { AppProviders } from './providers';
import { queryClient } from './query-client';
import { routes } from './router';

function renderApp(path = '/') {
  queryClient.clear();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

async function login(email: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), 'demo1234');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
  return user;
}

describe('app shell flow', () => {
  // Real latency exposes loading races between guards (e.g. location selection bouncing back).
  beforeEach(() => mockConfig.getState().set({ latencyMs: 30 }));

  it('redirects to login, then location selection, then dashboard', async () => {
    const router = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();

    const user = await login('owner@pilot.demo');
    expect(await screen.findByRole('heading', { name: 'Choose a location' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Main Restaurant/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(await screen.findByText('Sales today')).toBeInTheDocument();
    expect(screen.getByText('Open tables')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Restaurant POS/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open kitchen board/ })).toBeInTheDocument();
  });

  it('leaves restaurant tiles and shortcuts off the dashboard of a store (DASH-001)', async () => {
    renderApp('/');
    const user = await login('owner@pilot.demo');
    await user.click(await screen.findByRole('radio', { name: /Central Store/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('Sales today')).toBeInTheDocument();
    expect(screen.queryByText('Open tables')).toBeNull();
    expect(screen.queryByRole('link', { name: /Open (Retail|Restaurant) POS/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /Open kitchen board/ })).toBeNull();
  });

  it('shows validation messages from shared Zod schemas', async () => {
    renderApp('/login');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
  });

  it('single-location cashier skips location selection and gets 403 on settings (SCN-006)', async () => {
    renderApp('/settings/users');
    await login('cashier@pilot.demo');
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
    expect(screen.getByText(/settings\.manage/)).toBeInTheDocument();
  });

  it('hides modules the tenant is not entitled to', async () => {
    renderApp('/sales/tables');
    await login('owner@grocery.demo');
    expect(await screen.findByText(/Table management module is not enabled/)).toBeInTheDocument();
  });

  it('sends kitchen staff straight to the kitchen board', async () => {
    const router = renderApp('/');
    await login('kitchen@pilot.demo');
    const board = await screen.findByRole('heading', { name: 'KOT / Kitchen' });
    expect(
      within(board.closest('[data-screen-id]') as HTMLElement).getByText('New'),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/kitchen');
  });
});
