// Shared helpers for the user-guide screenshot scripts (see run.mjs).
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(HERE, '../../public/guide/shots');
export const BASE_URL = process.env.GUIDE_BASE_URL ?? 'http://localhost:5175';
export const DESKTOP = { width: 1366, height: 768 };
export const MOBILE = { width: 390, height: 844 };
export const PASSWORD = 'demo1234';
/** Employee PINs for the verification dialog (README). */
export const PINS = {
  owner: '1111',
  manager: '2222',
  cashier: '3333',
  waiter: '4444',
  chef: '5555',
  bakeryCashier: '6666',
  rep: '7777',
  rider: '8888',
};
export const EMAILS = {
  owner: 'owner@pilot.demo',
  manager: 'manager@pilot.demo',
  cashier: 'cashier@pilot.demo',
  waiter: 'waiter@pilot.demo',
  kitchen: 'kitchen@pilot.demo',
  rep: 'rep@pilot.demo',
  rider: 'rider@pilot.demo',
};

mkdirSync(OUT_DIR, { recursive: true });

let browser;
export async function launch() {
  browser ??= await chromium.launch();
  return browser;
}
export async function close() {
  await browser?.close();
  browser = undefined;
}

/** Fresh context = fresh mock DB (it lives in localStorage). */
export async function newPage({ mobile = false } = {}) {
  const b = await launch();
  const context = await b.newContext({
    viewport: mobile ? MOBILE : DESKTOP,
    deviceScaleFactor: mobile ? 2 : 1,
    hasTouch: mobile,
    baseURL: BASE_URL,
    locale: 'en-LK',
    timezoneId: 'Asia/Colombo',
    colorScheme: 'light',
  });
  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (e) => console.warn(`[pageerror] ${page.url()} :: ${e.message}`));
  return page;
}

/** Sign in as a demo user; picks `location` (text match) if the location picker appears. */
export async function login(page, email, { location = 'Main' } = {}) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await settle(page);
  if (page.url().includes('select-location')) {
    await page.getByRole('main').getByText(new RegExp(location)).first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/select-location'));
  }
  await settle(page);
}

/** Clear the session only (keeps the mock DB), then sign in as someone else. */
export async function switchUser(page, email, opts) {
  await page.evaluate(() => localStorage.removeItem('rbp.session'));
  await login(page, email, opts);
}

/** Wait for network + spinners + animations to finish. */
export async function settle(page, ms = 400) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page
    .locator('[aria-busy="true"], .animate-spin')
    .first()
    .waitFor({ state: 'detached', timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(ms);
}

/** Type a PIN into the open employee-verification dialog and confirm. */
export async function enterPin(page, pin) {
  const dialog = page.getByRole('dialog').last();
  await dialog.waitFor();
  await page.keyboard.type(pin, { delay: 60 });
  await page.waitForTimeout(300);
}

/**
 * Save a JPEG to public/guide/shots/<name>.jpg. Pass `locator` to crop to an element
 * (e.g. a dialog) instead of the viewport, or `clip` ({x, y, width, height}) to a region.
 */
export async function shot(page, name, { locator, fullPage = false, clip } = {}) {
  await settle(page, 250);
  const path = join(OUT_DIR, `${name}.jpg`);
  const opts = { path, type: 'jpeg', quality: 82, animations: 'disabled', caret: 'hide' };
  if (locator) await locator.screenshot(opts);
  else await page.screenshot({ ...opts, fullPage, ...(clip ? { clip } : {}) });
  console.log(`  ✓ ${name}`);
  return path;
}
