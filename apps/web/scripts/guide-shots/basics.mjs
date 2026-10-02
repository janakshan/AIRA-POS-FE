import { EMAILS, login, newPage, settle, shot } from './lib.mjs';

/** Getting started (sign-in, navigation, PIN, preferences) and the dashboard. */
export default async function basics() {
  const page = await newPage();
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(EMAILS.manager);
  await page.getByLabel(/password/i).fill('demo1234');
  await shot(page, 'start-signIn-1');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/select-location/);
  await page.getByRole('main').getByText('Main Restaurant').click();
  await shot(page, 'start-signIn-2');
  await page.context().close();

  const owner = await newPage();
  await login(owner, EMAILS.owner);
  await shot(owner, 'dashboard-overview-1', { clip: { x: 0, y: 0, width: 1366, height: 410 } });

  // Sidebar with a group expanded.
  await owner
    .getByRole('navigation')
    .getByRole('button', { name: /^Sales$/ })
    .click();
  await settle(owner);
  await shot(owner, 'start-navigate-1');
  await owner
    .getByRole('navigation')
    .getByRole('button', { name: /^Sales$/ })
    .click();

  // Location switcher in the top bar.
  await owner.getByRole('button', { name: 'Switch location' }).click();
  await settle(owner);
  await shot(owner, 'start-navigate-2');
  await owner.keyboard.press('Escape');

  // Employee PIN dialog (opened from the dashboard's test card), part-typed.
  await owner.getByRole('button', { name: /Test employee PIN/ }).click();
  const dialog = owner.getByRole('dialog');
  await dialog.waitFor();
  await owner.keyboard.type('11', { delay: 80 });
  await shot(owner, 'start-pin-1', { locator: dialog });
  await owner.keyboard.press('Escape');

  // Account menu with the language sub-menu open.
  await owner.getByRole('button', { name: 'Account' }).click();
  await owner.getByRole('menuitem', { name: /Language/ }).hover();
  await settle(owner);
  await shot(owner, 'start-preferences-1');
  await owner.context().close();

  // Phone: the menu drawer.
  const phone = await newPage({ mobile: true });
  await login(phone, EMAILS.cashier);
  await phone.getByRole('button', { name: 'Open menu' }).click();
  await settle(phone);
  await shot(phone, 'start-navigate-3');
  await phone.context().close();
}
