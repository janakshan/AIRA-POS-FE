import { EMAILS, PINS, enterPin, login, newPage, settle, shot } from './lib.mjs';

/** Inventory (stock, adjustments, transfers, movements, low stock) and Purchasing. */
export default async function inventory() {
  await stockAndAdjust();
  await transfers();
  await purchasing();
}

const lastDialog = (page) => page.getByRole('dialog').last();

async function stockAndAdjust() {
  const page = await newPage();
  await login(page, EMAILS.owner, { location: 'Main' });

  // Stock overview + item page
  await page.goto('/inventory/stock');
  await settle(page, 800);
  await shot(page, 'inventory-checkStock-1');
  await page.getByRole('cell', { name: 'Sandwich Bread (450g)' }).first().click();
  await page.waitForURL(/\/inventory\/stock\/.+/);
  await settle(page, 800);
  await shot(page, 'inventory-checkStock-2');

  // Adjust stock: count
  await page.goto('/inventory/stock');
  await settle(page, 600);
  await page.getByRole('button', { name: 'Adjust stock' }).click();
  const dlg = lastDialog(page);
  await dlg
    .getByRole('searchbox')
    .or(dlg.getByLabel('Search items by name or code'))
    .first()
    .fill('Chicken');
  await settle(page, 600);
  await shot(page, 'inventory-adjustStock-1', { locator: dlg });
  await dlg.getByRole('button', { name: /^Chicken, / }).click();
  await settle(page, 300);
  await shot(page, 'inventory-adjustStock-2', { locator: dlg });
  await dlg.getByRole('button', { name: 'Next' }).click();
  await settle(page, 300);
  await page.keyboard.type('33', { delay: 60 });
  await settle(page, 300);
  if (!(await dlg.getByText('35 → 33').count())) {
    for (const d of '33') await dlg.getByRole('button', { name: d, exact: true }).click();
  }
  await shot(page, 'inventory-adjustStock-3', { locator: dlg });
  await dlg.getByRole('button', { name: 'Continue to approval' }).click();
  await settle(page, 400);
  await shot(page, 'inventory-adjustStock-4', { locator: lastDialog(page) });
  await enterPin(page, PINS.manager);
  const reason = lastDialog(page);
  await reason.getByText('Stock count difference').waitFor();
  await page.waitForTimeout(4500); // let the "Verified" toast fade
  await reason.getByText('Stock count difference').click();
  await settle(page, 300);
  await shot(page, 'inventory-adjustStock-5', { locator: reason });
  await reason.getByRole('button', { name: 'Confirm' }).click();
  await settle(page, 800);
  await page.goto('/inventory/adjustments');
  await settle(page, 800);
  await shot(page, 'inventory-adjustStock-6');

  // Movements
  await page.goto('/inventory/movements');
  await settle(page, 800);
  await page.getByRole('button', { name: 'Last 7 days' }).click();
  await settle(page, 800);
  await shot(page, 'inventory-movements-1');

  // Low stock
  await page.goto('/inventory/low-stock');
  await settle(page, 800);
  await shot(page, 'inventory-lowStock-1');
  await page.getByRole('button', { name: 'Set minimum for Egg Pastry' }).click();
  await settle(page, 400);
  await shot(page, 'inventory-lowStock-2', { locator: lastDialog(page) });
  await page.keyboard.press('Escape');
  await settle(page, 400);
  await page.getByRole('button', { name: /^Transfer Sandwich Bread/ }).click();
  await settle(page, 800);
  await shot(page, 'inventory-lowStock-3', { locator: lastDialog(page) });
  await page.context().close();
}

async function transfers() {
  const page = await newPage();
  await login(page, EMAILS.owner, { location: 'Main' });
  await page.goto('/inventory/transfers');
  await settle(page, 800);
  await page.getByRole('button', { name: 'New transfer' }).click();
  const dlg = lastDialog(page);
  await settle(page, 400);
  // To: Bakery Outlet
  await dlg.getByRole('combobox', { name: 'To' }).click();
  await page.getByRole('option', { name: 'Bakery Outlet' }).click();
  const search = dlg.getByLabel('Search items by name or code');
  await search.waitFor();
  for (const [q, name, qty] of [
    ['Chicken Roll', 'Chicken Roll', '20'],
    ['Fish Bun', 'Fish Bun', '15'],
  ]) {
    if (!(await search.isVisible().catch(() => false))) {
      await dlg.getByRole('button', { name: 'Add item' }).click();
    }
    await search.fill(q);
    await settle(page, 400);
    await dlg.getByRole('button', { name: new RegExp(`^${name}, `) }).click();
    await settle(page, 300);
    const input = dlg.getByLabel(`Quantity of ${name}`);
    await input.fill(qty);
    await input.press('Tab');
  }
  await dlg.getByLabel('Note (optional)').fill('Afternoon delivery run');
  await settle(page, 300);
  await shot(page, 'inventory-transferStock-1', { locator: dlg });
  await dlg.getByRole('button', { name: /^Dispatch/ }).click();
  await settle(page, 1000);
  await page.waitForTimeout(4500); // let the toast fade
  await shot(page, 'inventory-transferStock-2');

  // Receive at the Bakery
  await page.getByRole('button', { name: 'Switch location' }).click();
  await settle(page, 300);
  await shot(page, 'inventory-receiveTransfer-1');
  await page
    .getByRole('menuitem', { name: /Bakery Outlet/ })
    .or(page.getByRole('menuitemradio', { name: /Bakery Outlet/ }))
    .first()
    .click();
  await settle(page, 1000);
  await page.goto('/inventory/transfers');
  await settle(page, 800);
  await page.getByRole('button', { name: 'Incoming' }).click();
  await settle(page, 800);
  await page
    .getByRole('button', { name: /^Open transfer TRF-/ })
    .first()
    .click();
  await settle(page, 600);
  const det = lastDialog(page);
  const fish = det.getByLabel('Received Fish Bun');
  await fish.fill('14');
  await fish.press('Tab');
  await settle(page, 300);
  await shot(page, 'inventory-receiveTransfer-2', { locator: det });
  await det.getByRole('button', { name: /^Receive/ }).click();
  await settle(page, 800);
  await shot(page, 'inventory-receiveTransfer-3');
  await page.context().close();
}

async function purchasing() {
  const page = await newPage();
  await login(page, EMAILS.owner, { location: 'Main' });

  // Suppliers
  await page.goto('/purchasing/suppliers');
  await settle(page, 800);
  await shot(page, 'purchasing-suppliers-1');
  await page
    .getByRole('link', { name: 'New supplier' })
    .or(page.getByRole('button', { name: 'New supplier' }))
    .first()
    .click();
  await settle(page, 600);
  await page.getByLabel('Supplier name').fill('Hill Country Vegetables');
  const terms = page.getByLabel('Payment terms (days)');
  await terms.fill('14');
  await page.getByLabel('Contact person').fill('Nimal Fernando');
  await page.getByLabel('Phone').fill('077 456 7890');
  await page.getByLabel('Email').fill('orders@hillveg.lk');
  await page.getByLabel(/^Note/).fill('Delivers before 7 am');
  await settle(page, 300);
  await shot(page, 'purchasing-suppliers-2');
  await page.getByRole('button', { name: 'Save supplier' }).click();
  await page.waitForURL(/\/purchasing\/suppliers\/(?!new)[^/]+$/);
  await settle(page, 4500);
  await shot(page, 'purchasing-suppliers-3');

  // New PO
  await page.goto('/purchasing/orders/new');
  await settle(page, 800);
  await page.getByRole('combobox', { name: /Supplier/ }).click();
  await page.getByRole('option', { name: /Galle Road/ }).click();
  await page.getByLabel('Expected').fill('2026-10-03');
  const sb = page.getByLabel('Search items by name or code');
  for (const [q, name] of [
    ['Fish Bun', 'Fish Bun', '40', '55'],
    ['Chicken Roll', 'Chicken Roll', '30', '95'],
  ]) {
    if (!(await sb.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Add item' }).click();
    }
    await sb.fill(q);
    await settle(page, 400);
    await page
      .getByRole('button', { name: new RegExp(`^${name}`) })
      .first()
      .click();
    await settle(page, 300);
  }
  await page
    .getByRole('button', { name: 'Done adding' })
    .click()
    .catch(() => {});
  for (const [name, qty, cost] of [
    ['Fish Bun', '40', '55'],
    ['Chicken Roll', '30', '95'],
  ]) {
    await page.getByLabel(`Quantity of ${name}`).fill(qty);
    await page.getByLabel(`Unit cost of ${name}`).fill(cost);
  }
  await page.getByLabel(`Unit cost of Chicken Roll`).press('Tab');
  await settle(page, 400);
  await shot(page, 'purchasing-createPo-1');
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await page.waitForURL(/\/purchasing\/orders\/(?!new)[^/]+$/);
  await settle(page, 4500);
  await shot(page, 'purchasing-placePo-1');
  await page.getByRole('button', { name: 'Place order' }).click();
  await settle(page, 4500);
  await shot(page, 'purchasing-placePo-2');
  const poNumber = (await page.getByRole('heading', { level: 1 }).innerText()).match(/PO-\d+/)?.[0];

  // Receive
  await page.goto('/purchasing/receiving');
  await settle(page, 800);
  await shot(page, 'purchasing-receiveGoods-1');
  await page
    .getByRole('link', { name: `Receive ${poNumber}` })
    .or(page.getByRole('button', { name: `Receive ${poNumber}` }))
    .first()
    .click();
  await settle(page, 800);
  const q = page.getByLabel('Received now: Chicken Roll');
  await q.fill('24');
  await q.press('Tab');
  await page.getByLabel('Supplier invoice no.').fill('INV-88213');
  await page.getByLabel('Note', { exact: true }).fill('6 rolls short, rest to follow');
  await settle(page, 400);
  await shot(page, 'purchasing-receiveGoods-2');
  await page.getByRole('button', { name: /^Receive \d+ units?/ }).click();
  await page.waitForURL(/\/purchasing\/receiving\/(?!new)[^/]+$/);
  await settle(page, 4500);
  await shot(page, 'purchasing-receiveGoods-3');
  await page.context().close();
}
