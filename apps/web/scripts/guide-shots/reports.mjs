/* global document, window */
import { EMAILS, login, newPage, settle, shot } from './lib.mjs';

/** Reports: sales, products, locations, stock, voids & discounts, audit log. */
export default async function reports() {
  const page = await newPage();
  await login(page, EMAILS.owner);
  const main = page.getByRole('main');

  // Sales summary: last 30 days, location picker open.
  await page.goto('/reports/sales');
  await settle(page, 800);
  await main.getByRole('button', { name: 'Last 30 days' }).click();
  await settle(page, 800);
  await shot(page, 'reports-salesSummary-1');
  await main.getByRole('combobox', { name: 'Location' }).click();
  await page.getByRole('listbox').waitFor();
  await shot(page, 'reports-salesSummary-2');
  await page.keyboard.press('Escape');
  await settle(page);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('main *')].find(
      (n) => n.textContent === 'By payment method',
    );
    el?.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -130);
  });
  await shot(page, 'reports-salesSummary-3');
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('main *')].find(
      (n) => n.textContent === 'How net sales add up',
    );
    el?.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -80);
  });
  await shot(page, 'reports-salesSummary-4');

  // Product sales.
  await page.goto('/reports/products');
  await settle(page, 800);
  await main.getByRole('button', { name: 'Last 30 days' }).click();
  await settle(page, 800);
  await shot(page, 'reports-productSales-1');
  await page.evaluate(() => {
    const el = document.querySelector('main table');
    el?.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -80);
  });
  await shot(page, 'reports-productSales-2');

  // Location sales.
  await page.goto('/reports/locations');
  await settle(page, 800);
  await main.getByRole('button', { name: 'Last 30 days' }).click();
  await settle(page, 800);
  await shot(page, 'reports-locationSales-1');

  // Stock report, low items only.
  await page.goto('/reports/inventory');
  await settle(page, 800);
  await main.getByRole('button', { name: 'Last 30 days' }).click();
  await settle(page, 800);
  await shot(page, 'reports-stockReport-1');
  await main.getByRole('button', { name: 'Low now' }).click();
  await settle(page, 800);
  await shot(page, 'reports-stockReport-2');

  // Voids & discounts.
  await page.goto('/reports/voids');
  await settle(page, 800);
  await main.getByRole('button', { name: 'Last 30 days' }).click();
  await settle(page, 800);
  await shot(page, 'reports-voids-1');
  await main.getByRole('tab', { name: /^Refunds/ }).click();
  await settle(page, 600);
  await page.evaluate(() => {
    const el = document.querySelector('main [role="tablist"]');
    el?.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -20);
  });
  await shot(page, 'reports-voids-2');
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('main *')].find((n) => n.textContent === 'By reason');
    el?.scrollIntoView({ block: 'start' });
    window.scrollBy(0, -80);
  });
  await shot(page, 'reports-voids-3');

  // Make one ordinary change first, so the audit log has a before/after to show.
  await page.goto('/customers');
  await settle(page, 800);
  await main.locator('tbody tr').first().click();
  await page.waitForURL(/\/customers\/[^/]+$/);
  await page.goto(`${new URL(page.url()).pathname}/edit`);
  await settle(page, 800);
  await main.getByLabel(/^Notes/).fill('Prefers delivery after 6 PM. Call before coming.');
  await main.getByRole('button', { name: /^Save/ }).click();
  await page.waitForURL((u) => !u.pathname.endsWith('/edit'));
  await settle(page, 600);

  // Audit log.
  await page.goto('/reports/audit');
  await settle(page, 800);
  await shot(page, 'reports-audit-1');
  await main.getByRole('button', { name: /PIN-approved only/ }).click();
  await settle(page, 800);
  await main.getByRole('combobox', { name: 'Approved by' }).click();
  await page.getByRole('listbox').waitFor();
  await shot(page, 'reports-audit-2');
  await page.keyboard.press('Escape');
  await settle(page);
  await main.locator('tbody tr').first().click();
  await page.getByRole('dialog').waitFor();
  await settle(page, 600);
  await shot(page, 'reports-audit-3');
  await page.keyboard.press('Escape');
  await settle(page);
  await main.getByRole('button', { name: /PIN-approved only/ }).click();
  await main.getByRole('button', { name: 'Customers', exact: true }).click();
  await settle(page, 800);
  await main.locator('tbody tr').first().click();
  await page.getByRole('dialog').waitFor();
  await settle(page, 600);
  await shot(page, 'reports-audit-4');

  await page.context().close();
}
