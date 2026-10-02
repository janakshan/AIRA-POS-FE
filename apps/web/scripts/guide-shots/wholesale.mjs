/* global document, window -- used inside page.evaluate callbacks */
import { EMAILS, PINS, enterPin, login, newPage, settle, shot } from './lib.mjs';

/** Wholesale & field sales (shops, routes, van sales, collections, returns) and Staff (HR). */
export default async function wholesale() {
  await repPhone();
  await repDesktop();
  await staff();
}

/** Wait until success toasts have gone, so they don't cover the page. */
async function noToasts(page) {
  const toast = page.locator('[data-sonner-toast]').first();
  await toast.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
  await toast.waitFor({ state: 'detached', timeout: 12_000 }).catch(() => {});
  await settle(page, 200);
}

const qty = (page, name, value) =>
  page.getByLabel(`Quantity of ${name}`, { exact: true }).fill(String(value));

/** The rep's van sale on a phone: pick the shop, the goods, the payment, then the invoice. */
async function repPhone() {
  const page = await newPage({ mobile: true });
  await login(page, EMAILS.rep, { location: 'Van' });
  await page.goto('/wholesale/field-sales');
  await settle(page, 600);
  await shot(page, 'fieldSales-sell-1');

  await page.getByRole('button', { name: /Perera Grocery/ }).click();
  await settle(page, 600);
  await qty(page, 'Fish Bun', 20);
  await qty(page, 'Chicken Roll', 12);
  await qty(page, 'Sandwich Bread (450g)', 6);
  await page.evaluate(() => document.activeElement?.blur());
  await page.evaluate(() => window.scrollTo(0, 420));
  await shot(page, 'fieldSales-sell-2');

  await page.getByRole('button', { name: /Review/ }).click();
  await settle(page, 400);
  await page.getByLabel('Paid now').fill('3000');
  await page.getByLabel('Paid now').press('Tab');
  await page.evaluate(() => document.activeElement?.blur());
  await page
    .getByText('Payment', { exact: true })
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.evaluate(() => window.scrollBy(0, -90));
  await shot(page, 'fieldSales-sell-3');

  await page.getByRole('button', { name: 'Create invoice' }).click();
  await page.waitForURL(/field-sales\/[^?]+$/);
  await noToasts(page);
  await page
    .getByText('Give the shop a copy')
    .evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await shot(page, 'fieldSales-share-1');
  await page.context().close();
}

/** Rep on a laptop: sale + collection so the route shows progress, then shops, returns. */
async function repDesktop() {
  const page = await newPage();
  await login(page, EMAILS.rep, { location: 'Van' });

  // A quick sale to Perera Grocery so the route has a visited stop.
  await page.goto('/wholesale/field-sales?shop=shp_002');
  await settle(page, 600);
  await qty(page, 'Butter Cake Slice', 6);
  await qty(page, 'Fish Bun', 15);
  await page.getByRole('button', { name: /Review/ }).click();
  await page.getByRole('button', { name: 'Paid in full' }).click();
  await page.getByRole('button', { name: 'Create invoice' }).click();
  await page.waitForURL(/field-sales\/[^?]+$/);
  await settle(page, 600);

  // Collections: collect from Fathima Tea Kade on the route.
  await page.goto('/wholesale/routes');
  await settle(page, 600);
  await page.getByRole('button', { name: 'Collect from Fathima Tea Kade' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await dialog.getByLabel('Amount').fill('2000');
  await dialog.getByLabel('Amount').press('Tab');
  await settle(page, 300);
  await shot(page, 'wholesaleCollections-collect-1');
  await dialog.getByRole('button', { name: /^Collect / }).click();
  await dialog.waitFor({ state: 'detached' });
  await noToasts(page);
  await shot(page, 'wholesaleRoutes-plan-1');
  await shot(page, 'wholesaleRoutes-van-1', {
    locator: page.locator('main .grid > div').filter({ hasText: 'Load the van' }).last(),
  });

  await page.goto('/wholesale/collections');
  await settle(page, 600);
  await shot(page, 'wholesaleCollections-review-1');

  // External shops
  await page.goto('/customers/external-shops');
  await settle(page, 600);
  await shot(page, 'wholesaleShops-find-1');
  await page.getByRole('button', { name: 'New shop' }).click();
  const shopDialog = page.getByRole('dialog');
  await shopDialog.waitFor();
  await shopDialog.getByLabel('Shop name').fill('Green Leaf Grocery');
  await shopDialog.getByLabel('Owner').fill('Priya Rajan');
  await shopDialog.getByLabel('Phone').fill('077 245 6810');
  await shopDialog.getByLabel('Address').fill('14 Market Road');
  await shopDialog.getByLabel('Area').fill('Market');
  await shopDialog.getByLabel('Route').click();
  await page.getByRole('option', { name: /Route A/ }).click();
  await shopDialog.getByLabel('Notes').fill('Closed on Sundays');
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page, 300);
  await shot(page, 'wholesaleShops-add-1', { locator: shopDialog });
  await page.keyboard.press('Escape');
  await settle(page, 300);

  // Returns: goods back from Lakshmi Stores against an invoice.
  await page.goto('/wholesale/returns/new?shop=shp_001');
  await settle(page, 600);
  const invoice = page.locator('main [role=combobox]').nth(1);
  await invoice.click();
  await page.getByRole('option').nth(1).click();
  await settle(page, 500);
  const rows = page.getByRole('list', { name: 'Items returned' }).locator('li');
  await rows.nth(0).locator('input').fill('2');
  await rows.nth(0).locator('input').press('Tab');
  if ((await rows.count()) > 1) {
    await rows.nth(1).locator('input').fill('3');
    await rows.nth(1).locator('input').press('Tab');
    await rows.nth(1).getByRole('combobox').click();
    await page.getByRole('option', { name: 'Damaged' }).click();
  }
  await settle(page, 300);
  await shot(page, 'wholesaleReturns-record-1');
  await page.getByRole('button', { name: 'Record return' }).click();
  await enterPin(page, PINS.rep);
  const reason = page.getByRole('dialog').last();
  await reason.getByText(/Why is/).waitFor();
  await reason.getByText('Damaged item').click();
  await settle(page, 300);
  await shot(page, 'wholesaleReturns-record-2', { locator: reason });
  await reason.getByRole('button', { name: 'Confirm' }).click();
  await page.waitForURL(/returns\/(?!new)[^/?]+$/);
  await noToasts(page);
  await shot(page, 'wholesaleReturns-review-1');

  // Lakshmi Stores' statement now shows invoices, collections and the return.
  await page.goto('/customers/external-shops/shp_001');
  await settle(page, 600);
  await shot(page, 'wholesaleShops-statement-1');
  await page.context().close();
}

/** Staff: employees, attendance, roster, cash drawer, staff meals, food allowance. */
async function staff() {
  const page = await newPage();
  await login(page, EMAILS.manager, { location: 'Main' });

  await page.goto('/staff/employees');
  await settle(page, 600);
  await shot(page, 'staffEmployees-find-1');
  await page.getByRole('button', { name: 'Add employee' }).click();
  const add = page.getByRole('dialog');
  await add.waitFor();
  await add.getByLabel('Name').fill('Tharindu Perera');
  await add.getByLabel('Job title').fill('Barista');
  await add.getByLabel('Phone').fill('077 318 2245');
  await add.getByLabel('PIN', { exact: true }).fill('4826');
  await add.getByLabel('Monthly food allowance').fill('6000');
  await add.getByLabel('Main Restaurant').click();
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page, 300);
  await shot(page, 'staffEmployees-add-1', { locator: add });
  await page.keyboard.press('Escape');
  await settle(page, 300);

  // Clock in / out with a PIN.
  await page.goto('/staff/attendance');
  await settle(page, 600);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.keyboard.type(PINS.waiter, { delay: 80 });
  await settle(page, 800);
  await shot(page, 'staffAttendance-clock-1');
  const d = new Date(Date.now() - 86_400_000);
  const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.getByLabel('Date').fill(yesterday);
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page, 600);
  await shot(page, 'staffAttendance-sheet-1');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();

  await page.goto('/staff/employees');
  await settle(page, 600);
  await page.getByText('Kasun Perera').first().click();
  await page.waitForURL(/employees\/emp_/);
  await settle(page, 600);
  await shot(page, 'staffEmployees-detail-1');

  // Roster
  await page.goto('/staff/shifts');
  await settle(page, 600);
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await shot(page, 'staffShifts-roster-1');
  await page.getByRole('button', { name: 'Expand sidebar' }).click();

  // Cash drawer on the counter till.
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('rbp.session'));
    s.state.deviceId = 'dev_01';
    localStorage.setItem('rbp.session', JSON.stringify(s));
  });
  await page.goto('/staff/shifts?tab=drawer');
  await settle(page, 800);
  await page.getByRole('button', { name: 'Cash out' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('1500');
  await page.getByLabel('What for').fill('Milk and sugar for the kitchen');
  await page.getByRole('button', { name: 'Record' }).click();
  await page.getByText(/Milk and sugar for the kitchen/).waitFor();
  await settle(page, 400);
  await page.getByRole('button', { name: 'Cash in' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('2000');
  await page.getByLabel('What for').fill('Change from the bank');
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page, 300);
  await shot(page, 'staffShifts-drawer-1');
  await page.getByRole('button', { name: 'Record' }).click();
  await page.getByText(/Change from the bank/).waitFor();
  await settle(page, 400);

  const expectedText = await page
    .locator('dt', { hasText: 'Expected in drawer' })
    .locator('xpath=following-sibling::dd[1]')
    .innerText();
  const expected = Number(expectedText.replace(/[^\d.]/g, ''));
  await page.getByLabel('Counted').fill(String(expected - 200));
  await page.getByLabel('Your PIN').fill(PINS.manager);
  await page.getByLabel('Your PIN').press('Tab');
  await settle(page, 300);
  await shot(page, 'staffShifts-drawer-2');
  await page.getByRole('button', { name: 'Close shift' }).click();
  await noToasts(page);
  await shot(page, 'staffShifts-drawer-3');

  // Staff meal
  await page.goto('/staff/meals');
  await settle(page, 600);
  await page.getByRole('button', { name: 'Record staff meal' }).click();
  const meal = page.getByRole('dialog');
  await meal.waitFor();
  await meal.getByRole('combobox', { name: 'Employee' }).click();
  await page.getByRole('option', { name: /Arun Selvam/ }).click();
  await meal.getByRole('combobox', { name: 'Item' }).click();
  await page.getByRole('option').first().click();
  await meal.getByRole('button', { name: 'Add' }).click();
  await meal.getByRole('combobox', { name: 'Item' }).click();
  await page.getByRole('option').nth(3).click();
  await meal.getByRole('button', { name: 'Add' }).click();
  await settle(page, 300);
  await shot(page, 'staffMeals-record-1', { locator: meal });
  await meal.getByRole('button', { name: /^Record/ }).click();
  await enterPin(page, PINS.manager);
  const why = page.getByRole('dialog').last();
  await why.getByText('Meal on shift').click();
  await why.getByRole('button', { name: 'Confirm' }).click();
  await noToasts(page);
  await shot(page, 'staffMeals-review-1');

  await page.goto('/staff/allowance');
  await settle(page, 600);
  await shot(page, 'staffAllowance-review-1');

  // The allowance itself is set on the employee.
  await page.getByRole('link', { name: 'Kasun Perera' }).click();
  await page.waitForURL(/employees\/emp_/);
  await settle(page, 600);
  await page.getByRole('button', { name: 'Edit' }).click();
  const edit = page.getByRole('dialog');
  await edit.waitFor();
  await edit.getByLabel('Monthly food allowance').fill('6000');
  await page.evaluate(() => document.activeElement?.blur());
  await settle(page, 300);
  await shot(page, 'staffAllowance-set-1', { locator: edit });
  await page.keyboard.press('Escape');
  await page.context().close();
}
