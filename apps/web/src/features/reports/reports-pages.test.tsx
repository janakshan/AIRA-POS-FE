import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/** Capture what "Download CSV" saves. */
function captureDownloads() {
  const files: { name: string; blob: Blob }[] = [];
  let last: Blob | null = null;
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    last = b as Blob;
    return 'blob:test';
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (last) files.push({ name: this.download, blob: last });
  });
  return files;
}

afterEach(() => vi.restoreAllMocks());

describe('REP-001 sales summary', () => {
  it('changes the period in the URL and downloads the numbers as CSV', async () => {
    const files = captureDownloads();
    const { user, router } = await openAs('owner@pilot.demo', '/reports/sales');
    expect(
      await screen.findByText('How net sales add up', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Last 30 days' }));
    await waitFor(() => expect(router.state.location.search).toContain('from='));
    await user.click(screen.getByRole('button', { name: /Download CSV/ }));
    await waitFor(() => expect(files).toHaveLength(1));
    expect(files[0]!.name).toMatch(/^sales-summary-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
    const text = await files[0]!.blob.text();
    expect(text).toContain('Section,Item,Value');
    expect(text).toMatch(/Totals,Net sales,\d+\.\d{2}/);
    // On-screen labels, not internal codes.
    expect(text).toMatch(/Payment method,Cash,/);
    expect(text).toMatch(/Order type,Counter,/);
    expect(text).not.toMatch(/,(CASH|BANK_TRANSFER|DINE_IN|RETAIL),/);
  }, 20_000);
});

describe('report period filter', () => {
  it('refuses an inverted or future range instead of reporting on it', async () => {
    const { user } = await openAs(
      'owner@pilot.demo',
      '/reports/sales?from=2026-09-28&to=2026-09-20',
    );
    expect(
      await screen.findByText(/“From” is after “To”/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('How net sales add up')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Last 7 days' }));
    expect(
      await screen.findByText('How net sales add up', undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  }, 20_000);

  it('refuses a period that ends in the future', async () => {
    await openAs('owner@pilot.demo', '/reports/locations?from=2020-01-01&to=2999-01-01');
    expect(
      await screen.findByText(/can't end after today/, undefined, { timeout: 5000 }),
    ).toBeInTheDocument();
  }, 20_000);
});

describe('REP-005 voids & discounts', () => {
  it('lists voided invoices with the approver and reason', async () => {
    const { user } = await openAs('owner@pilot.demo', '/reports/voids?from=2000-01-01');
    const tab = await screen.findByRole('tab', { name: /Voided/ }, { timeout: 5000 });
    await user.click(tab);
    const panel = screen.getByRole('tabpanel');
    expect(await within(panel).findAllByText(/HX-(MAIN|BAK)-\d+/)).not.toHaveLength(0);
    expect(within(panel).getAllByText('Nirmala Rajan').length).toBeGreaterThan(0);
  }, 20_000);

  it('exports local dates, not UTC ISO timestamps', async () => {
    const files = captureDownloads();
    const { user } = await openAs('owner@pilot.demo', '/reports/voids?from=2000-01-01');
    await screen.findByRole('tab', { name: /Voided/ }, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: /Download CSV/ }));
    await waitFor(() => expect(files).toHaveLength(1));
    const text = await files[0]!.blob.text();
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
    expect(text).toMatch(/,"[^"]* 20\d\d, \d{1,2}:\d{2}/);
  }, 20_000);
});

describe('REP-006 audit report', () => {
  it('filters to a custom date range and location, and exports it', async () => {
    const files = captureDownloads();
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const pad = (n: number) => String(n).padStart(2, '0');
    const from = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const { user } = await openAs(
      'owner@pilot.demo',
      `/reports/audit?range=custom&from=${from}&location=loc_01BAKERY`,
    );
    expect(await screen.findByLabelText('From', undefined, { timeout: 5000 })).toHaveValue(from);
    expect((await screen.findAllByText(/Bakery Outlet|HX-BAK/)).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: /Download CSV/ }));
    await waitFor(() => expect(files).toHaveLength(1));
    const text = await files[0]!.blob.text();
    expect(text.split('\r\n')[0]).toContain('When,Action,Code,What');
    expect(text).toContain('Bakery Outlet');
    expect(text).not.toContain('Main Restaurant');
  }, 20_000);
});
