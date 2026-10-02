/* global window */
import { EMAILS, PINS, enterPin, login, newPage, settle, shot } from './lib.mjs';

/** Catalog (products, categories, location products, pricing, Quick Pad) and Customers. */
export default async function catalog() {
  await catalogShots();
  await customerShots();
}

async function catalogShots() {
  const page = await newPage();
  await login(page, EMAILS.manager);
  const main = page.getByRole('main');

  // Product list, filtered to one category.
  await page.goto('/catalog/products');
  await page.getByRole('table').waitFor();
  await settle(page, 600);
  await shot(page, 'catalog-findProduct-1');

  // Existing product: edit form with "Where it's sold".
  await page.getByRole('row', { name: /Chicken Kottu/ }).click();
  await page.getByText("Where it's sold").waitFor();
  await settle(page, 800);
  await shot(page, 'catalog-findProduct-2');

  // New product form.
  await page.goto('/catalog/products/new');
  await page.getByText('Price & tax', { exact: true }).waitFor();
  await settle(page, 500);
  await page.getByRole('textbox', { name: /^Name/ }).first().fill('Cheese & Onion Roll');
  await page.getByRole('textbox', { name: /^Code/ }).fill('S06');
  await main.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name: /Short Eats/ }).click();
  await page.getByLabel(/^Description/).fill('Crispy roll with cheese, onion and green chilli.');
  await settle(page, 300);
  await shot(page, 'catalog-addProduct-1');

  const price = page.getByLabel('Base price');
  await price.click();
  await price.pressSequentially('160');
  const barcodeInput = page.getByPlaceholder('4790001000123');
  await barcodeInput.fill('4790001000512');
  await barcodeInput.press('Enter');
  const section = page.getByText('Price & tax', { exact: true });
  await section.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 0));
  await section.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.mouse.wheel(0, -80);
  await settle(page, 400);
  await shot(page, 'catalog-addProduct-2');

  // Categories: form + row menu.
  await page.goto('/catalog/categories/new');
  await page.getByText('Appearance', { exact: true }).waitFor();
  await settle(page, 500);
  await page.getByRole('textbox', { name: /^Name/ }).first().fill('Juices');
  await page.getByRole('textbox', { name: /^Code/ }).fill('JUICE');
  await main.getByRole('combobox', { name: 'Parent category' }).click();
  await page.getByRole('option', { name: /Cold Drinks/ }).click();
  await settle(page, 300);
  await shot(page, 'catalog-categories-1');
  // Leave without saving.
  await page.goto('/catalog/categories');
  const leave = page.getByRole('button', { name: 'Leave' });
  if (await leave.isVisible().catch(() => false)) await leave.click();
  await page.getByRole('table').waitFor();
  await settle(page, 500);
  await page.getByRole('button', { name: 'More actions for Short Eats' }).click();
  await page.getByRole('menuitem', { name: 'Add subcategory' }).waitFor();
  await settle(page, 300);
  await shot(page, 'catalog-categories-2');
  await page.keyboard.press('Escape');

  // Location products at the Bakery Outlet.
  await page.goto('/catalog/location-products');
  await settle(page, 600);
  await main.getByRole('combobox', { name: 'Location' }).click();
  await page.getByRole('option', { name: /Bakery/ }).click();
  await settle(page, 800);
  const note = page.getByLabel('Stock note: Chocolate Cake Slice');
  if (await note.isEnabled().catch(() => false)) {
    await note.fill('4 left');
    await note.press('Enter');
    await settle(page, 500);
    await page.reload();
    await page.getByText('Bakery', { exact: true }).first().waitFor();
    await settle(page, 800);
  }
  await page
    .getByRole('heading', { name: 'Short Eats' })
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await settle(page, 400);
  await shot(page, 'catalog-locationProducts-1');

  await page.goto('/catalog/location-products');
  await settle(page, 600);
  await page.getByRole('button', { name: 'Settings for Chicken Kottu' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  await settle(page, 400);
  await shot(page, 'catalog-locationProducts-2', { locator: dialog });
  await page.keyboard.press('Escape');

  // Pricing grid with unsaved changes.
  await page.goto('/catalog/pricing');
  await page.getByRole('table').waitFor();
  await settle(page, 1200);
  const setCell = async (label, value) => {
    const cell = page.getByLabel(label);
    await cell.click();
    await cell.selectText();
    await cell.pressSequentially(value);
    await cell.blur();
  };
  await setCell('Butter Cake Slice · Bakery Outlet', '230');
  await setCell('Chocolate Cake Slice · Base price', '380');
  await settle(page, 300);
  await shot(page, 'catalog-pricing-1');

  await page.getByRole('button', { name: 'Save changes' }).click();
  await enterPin(page, PINS.owner);
  await page.getByText('Why are prices being lowered?').waitFor();
  await settle(page, 500);
  await shot(page, 'catalog-pricing-2', { locator: page.getByRole('dialog').last() });
  await page.keyboard.press('Escape');
  await page.context().close();

  // Quick Pad designer: reordered, unsaved.
  const qp = await newPage();
  await login(qp, EMAILS.manager);
  await qp.goto('/catalog/quick-pad');
  await qp.getByText('Live preview').waitFor();
  await settle(qp, 800);
  await qp.getByRole('button', { name: 'Move Kottu up' }).click();
  await settle(qp, 400);
  await shot(qp, 'catalog-quickPad-1');
  await qp.getByRole('button', { name: 'Button colour for Kottu' }).click();
  const colour = qp.getByRole('dialog');
  await colour.waitFor();
  await settle(qp, 400);
  await shot(qp, 'catalog-quickPad-2', { locator: colour });
  await qp.context().close();
}

async function customerShots() {
  const page = await newPage();
  await login(page, EMAILS.manager);

  await page.goto('/customers');
  await page.getByRole('table').waitFor();
  await settle(page, 600);
  await shot(page, 'customers-findCustomer-1');

  // New customer form, filled.
  await page.getByRole('link', { name: 'New customer' }).click();
  await page.getByRole('textbox', { name: /^Name/ }).first().fill('Sanjeewa Bandara');
  await page.locator('input[name="phones.0.number"]').fill('077 555 1234');
  await page.getByRole('button', { name: 'Add another number' }).click();
  await page.locator('input[name="phones.1.number"]').fill('011 255 7788');
  await page.getByLabel(/^Address/).fill('14 Temple Road, Nugegoda');
  await page.getByLabel(/^Notes/).fill('Call before delivery');
  await settle(page, 300);
  await page.setViewportSize({ width: 1366, height: 1180 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'customers-addCustomer-1');
  await page.setViewportSize({ width: 1366, height: 768 });

  // Customer detail.
  await page.goto('/customers');
  const leave = page.getByRole('button', { name: 'Leave' });
  if (await leave.isVisible().catch(() => false)) await leave.click();
  await page.getByRole('row', { name: /Nimal Perera/ }).click();
  await page.getByText('Recent orders').waitFor();
  await settle(page, 600);
  await shot(page, 'customers-viewCustomer-1');

  await page.getByRole('link', { name: 'Order history' }).click();
  await settle(page, 600);
  await page
    .getByRole('button', { name: /^Open order/ })
    .first()
    .click();
  const order = page.getByRole('dialog');
  await order.waitFor();
  await settle(page, 500);
  await shot(page, 'customers-viewCustomer-2');
  await page.keyboard.press('Escape');

  // Balance and payment on account.
  await page.getByRole('link', { name: 'Balance' }).click();
  await page.getByRole('button', { name: 'Receive payment' }).click();
  const pay = page.getByRole('dialog');
  await pay.waitFor();
  await page.keyboard.type('1000');
  await settle(page, 400);
  await shot(page, 'customers-receivePayment-1', { locator: pay });
  await pay.getByRole('button', { name: /^Receive LKR/ }).click();
  await settle(page, 1200);
  await shot(page, 'customers-receivePayment-2');
  await page.context().close();
}
