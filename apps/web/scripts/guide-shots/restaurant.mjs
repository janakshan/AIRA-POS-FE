import { EMAILS, PINS, login, newPage, settle, shot, switchUser } from './lib.mjs';

/** Restaurant: tables, restaurant POS order types, kitchen board, deliveries (rider on phone). */

const tile = (page, name) =>
  page.locator('[data-slot=product-tile]').filter({ hasText: name }).first();
const cat = (page, name) =>
  page
    .locator('main button')
    .filter({ hasText: new RegExp('^' + name) })
    .first();

async function add(page, category, product, n = 1) {
  await cat(page, category).click();
  await page.waitForTimeout(250);
  for (let i = 0; i < n; i++) {
    await tile(page, product).click();
    await page.waitForTimeout(200);
  }
}

async function openTable(page, name) {
  await page.goto('/sales/tables');
  await settle(page);
  await page.getByRole('button', { name: new RegExp(`^Table ${name} ·`) }).click();
  await page.waitForURL(/\/pos/);
  await settle(page, 700);
}

async function send(page) {
  await page.getByRole('button', { name: /Send \d+ to kitchen/ }).click();
  await page.getByRole('button', { name: 'All sent' }).waitFor();
  await settle(page);
}

async function leave(page) {
  await page.getByRole('button', { name: 'Leave table' }).click();
  await page.getByText('No items yet').waitFor();
  await settle(page);
}

async function dismissToasts(page) {
  // Toasts pile up over the content; close them the way a user would.
  for (let i = 0; i < 6; i++) {
    const btn = page.locator('[data-sonner-toast] [data-close-button]').first();
    if (!(await btn.count())) break;
    await btn.click({ force: true }).catch(() => {});
    await page.waitForTimeout(250);
  }
  await page
    .locator('[data-sonner-toast]')
    .first()
    .waitFor({ state: 'detached', timeout: 6_000 })
    .catch(() => {});
}

/** Click digits on the PIN keypad of the last dialog. */
async function typePin(page, pin) {
  const d = page.getByRole('dialog').last();
  for (const digit of pin) await d.getByRole('button', { name: digit, exact: true }).click();
  await page.waitForTimeout(900);
}

export default async function restaurant() {
  // ---------- Waiter: tables, dine-in, bill, transfer ----------
  const page = await newPage();
  await login(page, EMAILS.waiter);

  // T1: open, add items, note, send, leave
  await openTable(page, 'T1');
  await add(page, 'Kottu', 'Chicken Kottu', 2);
  await add(page, 'Kottu', 'Cheese Kottu', 1);
  await add(page, 'Drinks', 'Milk Tea', 2);
  await dismissToasts(page);
  await shot(page, 'restaurantTables-openTable-1');
  await page.locator('button[aria-expanded]').filter({ hasText: 'Cheese Kottu' }).click();
  await page.getByRole('button', { name: 'Note for Cheese Kottu' }).click();
  const note = page.getByRole('dialog').last();
  await note.getByRole('button', { name: 'Less spicy' }).click();
  await note.getByRole('button', { name: 'No onion' }).click();
  await shot(page, 'restaurantTables-openTable-2', { locator: note });
  await note.getByRole('button', { name: 'Save note' }).click();
  await settle(page);
  // Collapse the line controls again.
  await page.locator('button[aria-expanded="true"]').filter({ hasText: 'Cheese Kottu' }).click();
  await settle(page, 300);
  await send(page);
  await shot(page, 'restaurantTables-openTable-3');
  await leave(page);

  // T3 and T4 occupied
  await openTable(page, 'T3');
  await add(page, 'Kottu', 'Egg Kottu', 1);
  await add(page, 'Short Eats', 'Fish Bun', 2);
  await send(page);
  await leave(page);

  await openTable(page, 'T4');
  await add(page, 'Rice & Curry', 'Chicken Rice & Curry', 2);
  await add(page, 'Rice & Curry', 'Vegetable Rice & Curry', 1);
  await send(page);
  await dismissToasts(page);
  await page.getByRole('button', { name: 'Print bill' }).click();
  const bill = page.getByRole('dialog').last();
  await bill.waitFor();
  await settle(page, 600);
  await shot(page, 'restaurantTables-printBill-1');
  await page.keyboard.press('Escape');
  await settle(page);
  await leave(page);

  // Floor plan with free / occupied / bill printed
  await page.goto('/sales/tables');
  await settle(page, 700);
  await shot(page, 'restaurantTables-floorPlan-1');

  // Transfer T3 → T5
  await openTable(page, 'T3');
  await dismissToasts(page);
  await page.getByRole('button', { name: 'Transfer' }).click();
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: /^Table T5/ })
    .waitFor();
  await settle(page, 500);
  await shot(page, 'restaurantTables-transferTable-1');
  await page
    .getByRole('dialog')
    .last()
    .getByRole('button', { name: /^Table T5/ })
    .click();
  await settle(page, 700);
  await shot(page, 'restaurantTables-transferTable-2', {
    locator: page.getByRole('dialog').last(),
  });
  await typePin(page, PINS.manager);
  const reason = page.getByRole('dialog').last();
  await reason.getByText('Customer request', { exact: true }).click();
  await settle(page, 300);
  await shot(page, 'restaurantTables-transferTable-3', { locator: reason });
  await reason.getByRole('button', { name: 'Confirm' }).click();
  await settle(page, 800);
  await leave(page);

  // ---------- Kitchen board ----------
  await switchUser(page, EMAILS.kitchen);
  await page.goto('/kitchen');
  await settle(page, 800);
  await dismissToasts(page);
  const kots = await page
    .locator('article')
    .evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  const num = (re) => kots.find((l) => re.test(l))?.split(' · ')[0];
  const t4 = num(/DINE-IN · T4/);
  const t5 = num(/DINE-IN · T5/);
  await page.getByRole('button', { name: `Start ${t4}` }).click();
  await settle(page);
  await page.getByRole('button', { name: `Start ${t5}` }).click();
  await settle(page);
  await page.getByRole('button', { name: `Ready ${t5}` }).click();
  await settle(page, 600);
  await dismissToasts(page);
  await shot(page, 'kitchenBoard-readBoard-1');
  const t1 = num(/DINE-IN · T1/);
  await page.getByRole('button', { name: `Start ${t1}` }).click();
  await settle(page, 600);
  await shot(page, 'kitchenBoard-cookTicket-1');
  await page.getByRole('button', { name: new RegExp(`Print ${t1}`) }).click();
  await settle(page, 600);
  await shot(page, 'kitchenBoard-printTicket-1', { locator: page.getByRole('dialog').last() });
  await page.keyboard.press('Escape');
  await page.context().close();

  // ---------- Cashier: restaurant POS order types ----------
  const pos = await newPage();
  await login(pos, EMAILS.cashier);
  await pos.goto('/sales/restaurant');
  await pos.waitForURL(/\/pos/);
  await settle(pos, 700);
  await shot(pos, 'restaurantPos-orderTypes-1');

  // Takeaway
  await pos.getByRole('radio', { name: 'Takeaway' }).click();
  await add(pos, 'Kottu', 'Egg Kottu', 1);
  await add(pos, 'Short Eats', 'Fish Bun', 2);
  await send(pos);
  await shot(pos, 'restaurantPos-takeaway-1');
  await pos.getByRole('button', { name: /^Pay ·/ }).click();
  await pos.getByRole('button', { name: 'Exact' }).click();
  await pos.getByRole('button', { name: /^Take / }).click();
  await pos.getByRole('dialog', { name: /Receipt / }).waitFor();
  await pos.keyboard.press('Escape');
  await settle(pos);
  await dismissToasts(pos);

  // Service charge (Charges dialog)
  await add(pos, 'Kottu', 'Cheese Kottu', 1);
  await pos.getByRole('button', { name: /^Charges/ }).click();
  await settle(pos, 700);
  await shot(pos, 'restaurantPos-serviceCharge-1', { locator: pos.getByRole('dialog').last() });
  await pos.keyboard.press('Escape');
  await settle(pos);

  // Delivery
  await add(pos, 'Kottu', 'Chicken Kottu', 2);
  await pos.getByRole('radio', { name: 'Delivery' }).click();
  const del = pos.getByRole('dialog').last();
  await del.getByLabel('Phone').fill('0771234567');
  await del.getByText('Saved customer').waitFor();
  await del.getByLabel(/Instructions/).fill('Call on arrival');
  await settle(pos, 400);
  await shot(pos, 'restaurantPos-delivery-1', { locator: del });
  await del.getByRole('button', { name: 'Save' }).click();
  await settle(pos, 700);
  await send(pos);
  await dismissToasts(pos);
  await shot(pos, 'restaurantPos-delivery-2');
  await pos.getByRole('button', { name: 'Hold' }).click();
  await pos.getByRole('dialog').last().getByRole('button', { name: 'Hold sale' }).click();
  await settle(pos, 700);

  // ---------- Deliveries board (dispatcher = cashier) ----------
  await pos.goto('/sales/deliveries');
  await settle(pos, 700);
  await dismissToasts(pos);
  await shot(pos, 'deliveries-dispatchBoard-1');
  await pos.getByRole('button', { name: 'Confirm: PH-MAIN-0001' }).click();
  await settle(pos, 700);
  await pos.getByRole('button', { name: 'Send to kitchen: PH-MAIN-0001' }).click();
  await settle(pos, 700);
  await dismissToasts(pos);
  await shot(pos, 'deliveries-moveOrder-1');
  await pos.getByRole('button', { name: 'Assign a rider to PH-MAIN-0001' }).click();
  const assign = pos.getByRole('dialog').last();
  await assign.getByText('Sameera Bandara').click();
  await settle(pos, 400);
  await shot(pos, 'deliveries-assignRider-1', { locator: assign });
  await assign.getByRole('button', { name: 'Assign' }).click();
  await settle(pos, 700);
  await pos.getByRole('button', { name: 'Mark ready: PH-MAIN-0001' }).click();
  await settle(pos, 700);
  await pos.getByRole('link', { name: 'PH-MAIN-0001' }).first().click();
  await pos.waitForURL(/\/sales\/deliveries\/.+/);
  await settle(pos, 700);
  await dismissToasts(pos);
  await shot(pos, 'deliveries-deliveryDetail-1');
  await pos.context().close();

  // ---------- Rider on a phone ----------
  const rider = await newPage({ mobile: true });
  await login(rider, EMAILS.rider);
  await rider.goto('/sales/deliveries');
  await settle(rider, 700);
  await shot(rider, 'deliveries-riderRun-1');
  await rider.getByRole('button', { name: 'Out for delivery: PH-MAIN-0003' }).click();
  await settle(rider, 700);
  await rider.getByRole('button', { name: 'Delivered: PH-MAIN-0004' }).click();
  const collect = rider.getByRole('dialog').last();
  await collect.getByLabel(/Cash received/).fill('1500');
  await settle(rider, 500);
  await shot(rider, 'deliveries-riderRun-2');
  await collect.getByRole('button', { name: /Paid · delivered/ }).click();
  await settle(rider, 800);
  await rider.context().close();
}
