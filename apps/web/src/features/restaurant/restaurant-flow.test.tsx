import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import { queryClient } from '@/app/query-client';
import { routes } from '@/app/router';
import { api } from '@/lib/api';
import { db } from '@/mocks/db';
import { useSessionStore } from '@/stores/session-store';

type User = ReturnType<typeof userEvent.setup>;

async function signIn(email: string, deviceId: string | null = 'dev_01') {
  const { accessToken } = await api.auth.login({ email, password: 'demo1234' });
  useSessionStore.getState().signIn(accessToken);
  useSessionStore.getState().setLocation('loc_01MAIN');
  useSessionStore.getState().setDevice(deviceId);
}

async function open(email: string, path: string, deviceId: string | null = 'dev_01') {
  await signIn(email, deviceId);
  queryClient.clear();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return router;
}

beforeEach(() => {
  const original = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({ ...original(query), matches: query.includes('1024px') }) as MediaQueryList,
  );
});
afterEach(() => vi.restoreAllMocks());

const sale = () => screen.getByRole('complementary', { name: /Current sale|Order / });
const saleReady = () => screen.findByRole('complementary', { name: /Current sale|Order / });

async function tapTile(user: User, tab: RegExp, product: RegExp) {
  await user.click(await screen.findByRole('tab', { name: tab }));
  await user.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: product }));
}

async function keypad(user: User, dialog: HTMLElement, digits: string) {
  for (const d of digits) await user.click(within(dialog).getByRole('button', { name: d }));
}

/** A dine-in order on T4 already sent to the kitchen (2 × Chicken Kottu, 1 × Milk Tea). */
async function seedTable() {
  await signIn('waiter@pilot.demo', 'dev_02');
  const order = await api.orders.create({
    lines: [
      { productId: 'prd_01K01', quantity: 2, note: 'Less spicy' },
      { productId: 'prd_01D02', quantity: 1 },
    ],
    adjustmentIds: [],
    status: 'OPEN',
    type: 'DINE_IN',
    tableId: 'tbl_T4',
  });
  await api.orders.sendToKitchen(order.id);
  await api.orders.release(order.id);
  return order;
}

describe('REST-002 dine-in on the POS', () => {
  it('picks a table, adds a note, sends to the kitchen and leaves the table open', async () => {
    await open('waiter@pilot.demo', '/pos');
    const user = userEvent.setup();

    await user.click(await within(await saleReady()).findByRole('radio', { name: 'Dine-in' }));
    const tables = await screen.findByRole('dialog', { name: 'Tables' });
    await user.click(await within(tables).findByRole('button', { name: 'Table T4 · Free' }));
    expect(within(sale()).getByRole('heading')).toHaveTextContent('T4');

    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(within(sale()).getByRole('button', { name: /1×Chicken Kottu/ }));
    expect(within(sale()).getByRole('button', { name: /1×Chicken Kottu/ })).toHaveTextContent(
      'Not sent',
    );
    await user.click(within(sale()).getByRole('button', { name: 'Note for Chicken Kottu' }));
    const note = await screen.findByRole('dialog', { name: 'Note for Chicken Kottu' });
    await user.click(within(note).getByRole('button', { name: 'Less spicy' }));
    await user.click(within(note).getByRole('button', { name: 'Save note' }));
    expect(within(sale()).getByRole('button', { name: /1×Chicken Kottu/ })).toHaveTextContent(
      'Less spicy',
    );

    await user.click(within(sale()).getByRole('button', { name: 'Send 1 to kitchen' }));
    expect(
      await screen.findByText('1 item sent · KOT-MAIN-000001 · Main Kitchen'),
    ).toBeInTheDocument();
    expect(within(sale()).getByRole('button', { name: /1×Chicken Kottu/ })).toHaveTextContent(
      'Sent',
    );
    expect(within(sale()).getByRole('button', { name: 'All sent' })).toBeDisabled();

    await user.click(within(sale()).getByRole('button', { name: 'Leave table' }));
    expect(
      await screen.findByText('T4 saved — the order stays open on the table'),
    ).toBeInTheDocument();
    expect(within(sale()).getByText('No items yet')).toBeInTheDocument();

    const [ticket] = await api.kots.list();
    expect(ticket).toMatchObject({
      table: 'T4',
      items: [{ name: 'Chicken Kottu', quantity: 1, note: 'Less spicy' }],
    });
    const t4 = (await api.tables.list()).find((tb) => tb.name === 'T4');
    expect(t4).toMatchObject({ status: 'OCCUPIED', order: { unsent: 0 } });
  });

  it('opens a table’s order, cancels sent food with a disposition, prints the bill and pays', async () => {
    const seeded = await seedTable();
    await open('cashier@pilot.demo', '/pos');
    const user = userEvent.setup();

    await user.click(await within(await saleReady()).findByRole('radio', { name: 'Dine-in' }));
    const tables = await screen.findByRole('dialog', { name: 'Tables' });
    await user.click(await within(tables).findByRole('button', { name: /Table T4 · Occupied/ }));
    expect(await screen.findByText('T4 opened')).toBeInTheDocument();
    const kottu = await within(sale()).findByRole('button', { name: /2×Chicken Kottu/ });
    expect(kottu).toHaveTextContent('Sent');

    // Reducing food the kitchen has: disposition → PIN → reason.
    if (kottu.getAttribute('aria-expanded') !== 'true') await user.click(kottu);
    await user.click(within(sale()).getByRole('button', { name: 'Decrease Chicken Kottu' }));
    const disposition = await screen.findByRole('dialog', {
      name: '1 × Chicken Kottu is already in the kitchen',
    });
    await user.click(within(disposition).getByRole('radio', { name: /Staff meal/ }));
    await user.click(within(disposition).getByRole('button', { name: 'Continue' }));
    await keypad(
      user,
      await screen.findByRole('dialog', { name: 'Employee verification' }),
      '2222',
    );
    const reason = await screen.findByRole('dialog', { name: /Why reduce Chicken Kottu/ });
    await user.click(within(reason).getByRole('radio', { name: 'Customer changed order' }));
    await user.click(within(reason).getByRole('button', { name: 'Confirm' }));
    await within(sale()).findByRole('button', { name: /1×Chicken Kottu/ });
    const cancel = (await api.kots.list()).find((k) => k.kind === 'CANCEL');
    expect(cancel?.items).toEqual([
      expect.objectContaining({ name: 'Chicken Kottu', quantity: 1, disposition: 'STAFF_MEAL' }),
    ]);

    // Table bill (pro-forma), then payment frees the table.
    await user.click(within(sale()).getByRole('button', { name: 'Print bill' }));
    const bill = await screen.findByRole('dialog', { name: `Receipt ${seeded.number}` });
    expect(bill).toHaveTextContent('BILL — NOT PAID');
    expect(bill).toHaveTextContent(/Dine-in\s*T4/);
    await user.click(within(bill).getAllByRole('button', { name: 'Close' })[0]!);
    expect((await api.tables.list()).find((tb) => tb.name === 'T4')?.status).toBe('BILLING');

    await user.click(within(sale()).getByRole('button', { name: /^Pay/ }));
    const pay = await screen.findByRole('dialog', { name: 'Payment' });
    await user.click(within(pay).getByRole('button', { name: /Card/ }));
    await user.click(within(pay).getByRole('button', { name: /^Take/ }));
    await screen.findByRole('button', { name: 'New sale' });
    await waitFor(async () =>
      expect((await api.tables.list()).find((tb) => tb.name === 'T4')?.status).toBe('FREE'),
    );
  });

  it('transfers a saved table order with a manager PIN', async () => {
    await seedTable();
    await open('waiter@pilot.demo', '/pos', 'dev_02');
    const user = userEvent.setup();
    await user.click(await within(await saleReady()).findByRole('radio', { name: 'Dine-in' }));
    await user.click(
      await within(await screen.findByRole('dialog', { name: 'Tables' })).findByRole('button', {
        name: /Table T4 · Occupied/,
      }),
    );
    await within(sale()).findByRole('button', { name: /2×Chicken Kottu/ });

    await user.click(within(sale()).getByRole('button', { name: 'Transfer' }));
    const pick = await screen.findByRole('dialog', { name: 'Move T4 to…' });
    await user.click(await within(pick).findByRole('button', { name: 'Table B2 · Free' }));
    await keypad(
      user,
      await screen.findByRole('dialog', { name: 'Employee verification' }),
      '2222',
    );
    const reason = await screen.findByRole('dialog', { name: 'Why move T4 to B2?' });
    await user.click(within(reason).getByRole('radio', { name: 'Customer request' }));
    await user.click(within(reason).getByRole('button', { name: 'Confirm' }));
    expect(await screen.findByText('Moved T4 → B2')).toBeInTheDocument();
    expect(within(sale()).getByRole('heading')).toHaveTextContent('B2');
    expect((await api.kots.list()).every((k) => k.table === 'B2')).toBe(true);
  });
});

describe('REST-006 delivery on the POS', () => {
  it('needs an address and phone before the sale can be paid', async () => {
    await open('cashier@pilot.demo', '/pos');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(within(sale()).getByRole('radio', { name: 'Delivery' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delivery details' });
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText('Enter the delivery address')).toBeInTheDocument();
    expect(within(dialog).getByText(/Enter a valid phone number/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Close/ }));
    expect(within(sale()).getByText('Add the delivery address and phone.')).toBeInTheDocument();
    expect(within(sale()).getByRole('button', { name: /^Pay/ })).toBeDisabled();

    await user.click(within(sale()).getByRole('button', { name: /Add delivery address/ }));
    const again = await screen.findByRole('dialog', { name: 'Delivery details' });
    await user.type(within(again).getByLabelText('Address'), '12 Galle Road, Colombo 3');
    await user.type(within(again).getByLabelText('Phone'), '0771234567');
    await user.click(within(again).getByRole('button', { name: 'Save' }));
    expect(within(sale()).getByText('12 Galle Road, Colombo 3')).toBeInTheDocument();
    expect(within(sale()).getByRole('button', { name: /^Pay/ })).toBeEnabled();
  });
});

describe('REST-006 delivery: customer by phone', () => {
  it('fills a known customer’s address from their phone and attaches them to the sale', async () => {
    await open('cashier@pilot.demo', '/pos');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(within(sale()).getByRole('radio', { name: 'Delivery' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delivery details' });

    await user.type(within(dialog).getByLabelText('Phone'), '0771234567');
    expect(await within(dialog).findByText('Nimal Perera')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Address')).toHaveValue('12 Galle Road, Colombo 03');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(within(sale()).getByText('12 Galle Road, Colombo 03')).toBeInTheDocument();
    expect(
      within(sale()).getByRole('button', { name: /Change customer: Nimal Perera/ }),
    ).toBeInTheDocument();
    expect(within(sale()).getByRole('button', { name: /^Pay/ })).toBeEnabled();
  });

  it('keeps an address staff typed, and says when the number is new', async () => {
    await open('cashier@pilot.demo', '/pos');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(within(sale()).getByRole('radio', { name: 'Delivery' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delivery details' });

    await user.type(within(dialog).getByLabelText('Phone'), '0779999999');
    expect(await within(dialog).findByText('New number — enter the address.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Address'), 'Lane 5, Wellawatte');
    // Switching to a known number doesn't overwrite what was typed.
    await user.clear(within(dialog).getByLabelText('Phone'));
    await user.type(within(dialog).getByLabelText('Phone'), '0772345678');
    expect(await within(dialog).findByText('Kavitha Sivakumar')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Address')).toHaveValue('Lane 5, Wellawatte');
    // The banner doesn't claim the address was filled in when it was kept.
    expect(within(dialog).getByText(/Keeping the address you typed/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/address filled in/)).toBeNull();
  });

  it('clears stale errors as fields change and explains a too-short address', async () => {
    await open('cashier@pilot.demo', '/pos');
    const user = userEvent.setup();
    await tapTile(user, /Kottu/, /Chicken Kottu/);
    await user.click(within(sale()).getByRole('radio', { name: 'Delivery' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delivery details' });

    await user.type(within(dialog).getByLabelText('Phone'), 'abc');
    await user.type(within(dialog).getByLabelText('Address'), 'x');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByText(/Enter a valid phone number/)).toBeInTheDocument();
    expect(
      within(dialog).getByText('Address is too short — enter at least 5 characters'),
    ).toBeInTheDocument();

    await user.clear(within(dialog).getByLabelText('Phone'));
    await user.type(within(dialog).getByLabelText('Phone'), '0771234567');
    expect(await within(dialog).findByText('Nimal Perera')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Enter a valid phone number/)).toBeNull();
    expect(within(dialog).getByLabelText('Address')).toHaveValue('x');
    expect(within(dialog).getByText(/Keeping the address you typed/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Address'), ' Road');
    expect(within(dialog).queryByText(/Address is too short/)).toBeNull();
  });
});

describe('KOT-003 kitchen board', () => {
  it('shows new tickets and moves them New → Preparing → Ready → served', async () => {
    await seedTable();
    await open('kitchen@pilot.demo', '/kitchen', null);
    const user = userEvent.setup();
    const column = (name: string) => screen.getByRole('region', { name: new RegExp(`^${name}`) });

    const ticket = await screen.findByRole('article', { name: 'KOT-MAIN-000001 · DINE-IN · T4' });
    expect(within(column('New')).getByRole('article', { name: /KOT-MAIN-000001/ })).toBe(ticket);
    expect(ticket).toHaveTextContent('2 × Chicken Kottu');
    expect(ticket).toHaveTextContent('Less spicy');
    // Milk Tea went to the bar on its own ticket.
    expect(screen.getByRole('article', { name: /KOT-MAIN-000002/ })).toHaveTextContent('Milk Tea');

    // The bar display only shows bar tickets.
    await user.click(screen.getByRole('button', { name: 'Beverage Bar' }));
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: /KOT-MAIN-000001/ })).toBeNull(),
    );
    await user.click(screen.getByRole('button', { name: 'All stations' }));

    await user.click(await screen.findByRole('button', { name: 'Start KOT-MAIN-000001' }));
    await waitFor(() =>
      expect(
        within(column('Preparing')).getByRole('article', { name: /KOT-MAIN-000001/ }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Ready KOT-MAIN-000001' }));
    await waitFor(() =>
      expect(
        within(column('Ready')).getByRole('article', { name: /KOT-MAIN-000001/ }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Served KOT-MAIN-000001' }));
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: /KOT-MAIN-000001/ })).toBeNull(),
    );

    // KOT-004 print preview.
    await user.click(screen.getByRole('button', { name: 'Print KOT-MAIN-000002' }));
    const preview = await screen.findByRole('dialog', { name: 'Kitchen ticket' });
    expect(preview).toHaveTextContent('BEVERAGE BAR');
    expect(preview).toHaveTextContent('1 x Milk Tea');
  });

  it('switches columns with status tabs on phones', async () => {
    await seedTable();
    await open('kitchen@pilot.demo', '/kitchen', null);
    const user = userEvent.setup();
    // jsdom has no media queries, so the phone tab bar renders (md:hidden hides it on wider screens).
    const tab = (name: RegExp) => screen.getByRole('tab', { name });
    expect(await screen.findByRole('tab', { name: 'New 2' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(tab(/^Preparing 0/)).toHaveAttribute('aria-controls', 'kot-panel-PREPARING');

    await user.click(await screen.findByRole('button', { name: 'Start KOT-MAIN-000001' }));
    await waitFor(() => expect(tab(/^Preparing 1/)).toBeInTheDocument());
    expect(tab(/^New 1/)).toBeInTheDocument();
    await user.click(tab(/^Preparing/));
    expect(tab(/^Preparing/)).toHaveAttribute('aria-selected', 'true');
    expect(tab(/^New/)).toHaveAttribute('aria-selected', 'false');
  });

  it('only announces tickets that arrive, not ones a station switch reveals', async () => {
    await seedTable();
    await open('kitchen@pilot.demo', '/kitchen', null);
    const user = userEvent.setup();
    await screen.findByRole('article', { name: /KOT-MAIN-000001/ });

    await user.click(screen.getByRole('button', { name: 'Beverage Bar' }));
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: /KOT-MAIN-000001/ })).toBeNull(),
    );
    await user.click(screen.getByRole('button', { name: 'All stations' }));
    await screen.findByRole('article', { name: /KOT-MAIN-000001/ });
    expect(screen.queryByText(/new ticket/)).toBeNull();

    // A ticket sent from another terminal is still announced.
    db.update((d) => {
      const kot = d.kots[0]!;
      d.kots.push({ ...kot, id: 'kot_other', number: 'KOT-MAIN-000099' });
    });
    await queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes('kots') });
    expect(await screen.findAllByText('1 new ticket')).not.toHaveLength(0);
  });

  it('is view-only for waiters', async () => {
    await seedTable();
    await open('waiter@pilot.demo', '/kitchen');
    await screen.findByRole('article', { name: /KOT-MAIN-000001/ });
    expect(screen.getByText('View only')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Start/ })).toBeNull();
  });
});

describe('REST-001 tables page', () => {
  it('shows tables by area and opens a table on the POS', async () => {
    await seedTable();
    const router = await open('waiter@pilot.demo', '/sales/tables');
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { name: /Indoor · 7 free/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Table T4 · Occupied/ })).toHaveTextContent(
      'Kasun Perera',
    );
    await user.click(screen.getByRole('button', { name: 'Table O2 · Free' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/pos'));
    expect(await within(sale()).findByRole('heading')).toHaveTextContent('O2');
    expect(within(sale()).getByRole('radio', { name: 'Dine-in' })).toBeChecked();
  });
});
