import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { routes } from '@/app/router';
import { api } from '@/lib/api';
import { useSessionStore } from '@/stores/session-store';

async function signIn(email: string) {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation('loc_01MAIN');
}

function open(path: string) {
  queryClient.clear();
  render(
    <AppProviders>
      <RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />
    </AppProviders>,
  );
}

/** One PIN-approved discount and one ordinary catalog change. */
async function seedEvents() {
  await signIn('cashier@pilot.demo');
  const { verificationId } = await api.identity.verifyEmployee({
    pin: '2222',
    action: 'pos.discount.apply',
  });
  await api.pos.adjustments.create({
    kind: 'DISCOUNT',
    scope: 'ORDER',
    mode: 'PERCENT',
    value: 1000,
    verification: { verificationId, reasonCode: 'LOYAL_CUSTOMER' },
  });
  await signIn('owner@pilot.demo');
  await api.catalog.categories.update('cat_01KOTTU', { name: 'Kottu Roti' });
}

describe('REP-006 Audit log', () => {
  it('lists changes with who approved them and why, filters PIN-approved ones, and shows the diff', async () => {
    await seedEvents();
    // Today only: REP history seeds a month of earlier events.
    open('/reports/audit?range=today');
    const user = userEvent.setup();
    expect(await screen.findByText('Discount applied', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('Category changed')).toBeInTheDocument();
    expect(screen.getByText('Loyal customer')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /PIN-approved only/ }));
    await waitFor(() => expect(screen.queryByText('Category changed')).toBeNull());
    expect(screen.getByText('Discount applied')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /PIN-approved only/ }));
    await user.click(await screen.findByRole('button', { name: /Category changed/ }));
    const sheet = await screen.findByRole('dialog', { name: 'Category changed' });
    expect(within(sheet).getByRole('table', { name: 'Change details' })).toHaveTextContent(
      /nameKottuKottu Roti/,
    );
    expect(sheet).toHaveTextContent('Nirmala Rajan');
  });

  it('is only for people with report.audit.view', async () => {
    await signIn('cashier@pilot.demo');
    open('/reports/audit');
    expect(await screen.findByText('Access denied')).toBeInTheDocument();
  });
});
