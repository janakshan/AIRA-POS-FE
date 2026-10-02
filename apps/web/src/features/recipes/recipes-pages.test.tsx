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

describe('REC-001 ingredients', () => {
  it('asks for the portion description instead of dropping grams, and rejects a taken name', async () => {
    const { user } = await openAs('owner@pilot.demo', '/production/ingredients');
    await user.click(
      await screen.findByRole('button', { name: 'New ingredient' }, { timeout: 5000 }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'New ingredient' });
    await user.type(within(dialog).getByLabelText('Name'), 'chicken');
    await user.type(within(dialog).getByLabelText('Code'), 'I09');
    await user.type(within(dialog).getByLabelText('Grams per portion'), '150');
    await user.click(within(dialog).getByRole('button', { name: 'Save ingredient' }));
    expect(
      await within(dialog).findByText('Say what one portion is, or clear the grams and per pack'),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Grams per portion')).toHaveValue('150');

    await user.type(within(dialog).getByLabelText('One portion is'), '150 g');
    await user.click(within(dialog).getByRole('button', { name: 'Save ingredient' }));
    expect(
      await within(dialog).findByText('An ingredient with this name already exists'),
    ).toBeInTheDocument();
  });
});

describe('REC-002/003 recipes', () => {
  it('lists recipe dishes with how many can be made and what limits them', async () => {
    await openAs('owner@pilot.demo', '/production/recipes');
    // jsdom is narrow: DataTable renders cards, each a button named after the dish.
    const card = (
      await screen.findByRole('button', { name: 'Chicken Rice & Curry' }, { timeout: 5000 })
    ).closest('li')!;
    expect(card).toHaveTextContent('36');
    expect(card).toHaveTextContent('limited by Chicken');
    expect(card).toHaveTextContent('1 ready');
    expect(screen.getByText('Menu items without a recipe')).toBeInTheDocument();
  });

  it('edits a recipe and the preview follows', async () => {
    const { user, router } = await openAs('owner@pilot.demo', '/production/recipes/prd_01R01');
    const chicken = await screen.findByRole(
      'spinbutton',
      { name: 'Quantity of Chicken' },
      { timeout: 5000 },
    );
    expect(await screen.findByText('35')).toBeInTheDocument();
    await user.clear(chicken);
    await user.type(chicken, '2');
    // 35 portions ÷ 2 a plate.
    expect(await screen.findByText('17')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save recipe' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/production/recipes'));
    const saved = await api.recipes.get('prd_01R01', 'loc_01MAIN');
    expect(saved.lines.find((l) => l.name === 'Chicken')?.quantity).toBe(2);
  }, 15_000);
});

describe('REC-004 planning → PUR-003', () => {
  it('turns expected sales into a purchase suggestion and a prefilled order', async () => {
    const { user, router } = await openAs('owner@pilot.demo', '/production/portions');
    const expected = await screen.findByRole(
      'spinbutton',
      { name: 'Expected sales of Chicken Rice & Curry' },
      { timeout: 5000 },
    );
    await user.clear(expected);
    await user.type(expected, '80');
    // 80 plates need 80 chicken; 35 on hand → buy 45 (the §21 example).
    expect(
      await screen.findByText(/Recommended purchase: .*Chicken 45 portions/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Create purchase order' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/purchasing/orders/new'));
    const qty = await screen.findByRole(
      'spinbutton',
      { name: 'Quantity of Chicken' },
      { timeout: 5000 },
    );
    expect(qty).toHaveValue('45');
  }, 15_000);
});

describe('REC-005 prepared items', () => {
  it('the kitchen disposes of an expired plate with a reason', async () => {
    const { user } = await openAs('kitchen@pilot.demo', '/production/prepared?status=EXPIRED');
    await user.click(
      await screen.findByRole('button', { name: 'Dispose of Egg Fried Rice' }, { timeout: 5000 }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Dispose of Egg Fried Rice' });
    // Expired: Wastage and a reason are filled in.
    expect(within(dialog).getByRole('radio', { name: /Wastage/ })).toBeChecked();
    await user.click(within(dialog).getByRole('button', { name: 'Dispose' }));
    expect(await screen.findByText('Egg Fried Rice recorded as Wastage')).toBeInTheDocument();
    const [item] = await api.preparedItems.list({ locationId: 'loc_01MAIN', status: 'DISPOSED' });
    expect(item).toMatchObject({ productName: 'Egg Fried Rice', disposal: { outcome: 'WASTAGE' } });
  }, 15_000);
});
