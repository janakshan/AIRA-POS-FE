import { EMAILS, PINS, enterPin, login, newPage, settle, shot } from './lib.mjs';

/** Retail POS (Bakery Outlet): finding products, cart, customer, discount, charges, payment,
 *  held sales, history, returns and the cash drawer. */
export default async function pos() {
  await makeSale();
  await afterSale();
}

const LOCATION = 'Bakery Outlet';

/** Toasts would cover the header in the shots: hide the toaster (without touching React's nodes). */
async function clearToasts(page) {
  await page.addStyleTag({ content: '[data-sonner-toaster]{visibility:hidden !important}' });
  await page.waitForTimeout(100);
}

async function openPos(page) {
  await login(page, EMAILS.manager, { location: LOCATION });
  await page.goto('/pos');
  await page.locator('[data-screen-id="POS-001"]').waitFor();
  await settle(page, 600);
  await clearToasts(page);
}

const tile = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) }).first();
const dialog = (page) => page.getByRole('dialog').last();
const action = (page, name) => page.getByRole('button', { name: `${name} (Needs a manager PIN)` });

async function pickReason(page, reason) {
  const d = dialog(page);
  await d.getByRole('radio', { name: reason }).click();
  await d.getByRole('button', { name: 'Confirm' }).click();
  await settle(page, 500);
}

async function makeSale() {
  const page = await newPage();
  await openPos(page);

  // Find products: tiles + cart.
  await tile(page, 'Chocolate Cake').click();
  await tile(page, 'Chocolate Cake').click();
  await tile(page, 'Butter Cake').click();
  await tile(page, 'Sandwich Bread').click();
  await settle(page);
  await shot(page, 'retailPos-findProducts-1');

  // Inline search.
  await page.getByPlaceholder('Search products or scan a barcode').fill('cake');
  await settle(page);
  await shot(page, 'retailPos-findProducts-2');
  await page.getByPlaceholder('Search products or scan a barcode').fill('');

  // Full search (F2).
  await page.getByRole('button', { name: 'Product search' }).click();
  await dialog(page).getByRole('combobox', { name: 'Product search' }).fill('tea');
  await settle(page);
  await shot(page, 'retailPos-findProducts-3');
  await page.keyboard.press('Escape');
  await settle(page);

  // Cart line controls.
  await page.getByRole('button', { name: /^2× Chocolate Cake/ }).click();
  await settle(page);
  await shot(page, 'retailPos-buildCart-1');
  await page.getByRole('button', { name: /^2× Chocolate Cake/ }).click();

  // Customer: new number first (create form), then a known one.
  await page.getByRole('button', { name: /Add customer/ }).click();
  const phone = dialog(page).getByLabel('Phone number');
  await phone.fill('0779998887');
  await dialog(page).getByText('Create customer').waitFor();
  await dialog(page).getByLabel('Customer name').fill('Ruwan Jayasinghe');
  await settle(page);
  await shot(page, 'retailPos-addCustomer-2', { locator: dialog(page) });
  await phone.fill('0771234567');
  await dialog(page).getByText('Nimal Perera').waitFor();
  await settle(page);
  await shot(page, 'retailPos-addCustomer-1', { locator: dialog(page) });
  await dialog(page)
    .getByRole('button', { name: /^Select/ })
    .first()
    .click();
  await settle(page);
  // Back to a walk-in sale (the rest of the demo is a counter sale).
  await page.getByRole('button', { name: 'Remove customer Nimal Perera' }).click();
  await settle(page);

  // Discount 10% on the whole bill → PIN → reason.
  await action(page, 'Discount').click();
  await dialog(page).getByRole('button', { name: '10%', exact: true }).click();
  await settle(page);
  await shot(page, 'retailPos-discount-1');
  await page.getByRole('button', { name: 'Apply discount' }).click();
  await page.getByRole('dialog', { name: 'Employee verification' }).waitFor();
  await settle(page);
  await shot(page, 'retailPos-discount-2');
  await enterPin(page, PINS.manager);
  await page.getByRole('dialog', { name: 'Why this discount?' }).waitFor();
  await dialog(page).getByRole('radio', { name: 'Loyal customer' }).click();
  await clearToasts(page);
  await shot(page, 'retailPos-discount-3');
  await dialog(page).getByRole('button', { name: 'Confirm' }).click();
  await settle(page, 600);

  // Charges: packaging (no PIN).
  await action(page, 'Charges').click();
  await dialog(page)
    .getByRole('button', { name: /^Add LKR/ })
    .first()
    .click();
  await dialog(page).getByText('On this sale').waitFor();
  await settle(page, 500);
  await clearToasts(page);
  await shot(page, 'retailPos-charges-1');
  await page.keyboard.press('Escape');
  await settle(page);

  // Cash payment with change.
  await page.getByRole('button', { name: /^Pay · / }).click();
  await dialog(page).getByText('Amount due').waitFor();
  await dialog(page).getByRole('button', { name: 'LKR 2,000.00' }).click();
  await settle(page);
  await clearToasts(page);
  await shot(page, 'retailPos-takePayment-1');
  await page.getByRole('button', { name: /^Take / }).click();
  await page.getByRole('dialog', { name: /^Receipt / }).waitFor();
  await settle(page, 600);
  await clearToasts(page);
  await shot(page, 'retailPos-takePayment-2');

  await page.context().close();
}

async function afterSale() {
  const page = await newPage();
  await openPos(page);

  // A paid card sale to return later.
  await tile(page, 'Chocolate Cake').click();
  await tile(page, 'Chocolate Cake').click();
  await tile(page, 'Butter Cake').click();
  await tile(page, 'Sandwich Bread').click();
  await page.getByRole('button', { name: /^Pay · / }).click();
  await dialog(page).getByRole('button', { name: 'Card' }).click();
  await page.getByRole('button', { name: /^Take / }).click();
  await page.getByRole('button', { name: 'New sale' }).click();
  await settle(page);

  // Two held sales.
  const hold = async (label) => {
    await page.getByRole('button', { name: 'Hold', exact: true }).click();
    await dialog(page).getByRole('textbox').fill(label);
    await page.getByRole('button', { name: 'Hold sale' }).click();
    await settle(page);
  };
  await tile(page, 'Butter Cake').click();
  await tile(page, 'Butter Cake').click();
  await tile(page, 'Sandwich Bread').click();
  await hold('Pickup at 5 pm');
  await page.getByText('Drinks', { exact: true }).click();
  await tile(page, 'Milk Tea').click();
  await tile(page, 'Milk Tea').click();
  await tile(page, 'Plain Tea').click();
  await hold('Mrs. Fernando');

  await page.getByRole('button', { name: /^Held sales/ }).click();
  await dialog(page).getByText('Mrs. Fernando').waitFor();
  await settle(page);
  await clearToasts(page);
  await shot(page, 'retailPosManage-holdSale-1');

  // Resume the pickup order; removing a saved item asks for a PIN.
  await dialog(page).getByRole('button', { name: 'Resume BAK-000002' }).click();
  await settle(page);
  await page.getByRole('button', { name: /^2× Butter Cake/ }).click();
  await page.getByRole('button', { name: 'Remove Butter Cake Slice' }).last().click();
  await page.getByRole('dialog', { name: 'Employee verification' }).waitFor();
  await settle(page);
  await clearToasts(page);
  await shot(page, 'retailPosManage-holdSale-2');
  await page.keyboard.press('Escape');
  await settle(page);
  await page.getByRole('button', { name: /^2× Butter Cake/ }).click();
  await hold('Pickup at 5 pm');

  // History.
  await page.getByRole('button', { name: 'Sales history' }).click();
  await dialog(page).getByText('Paid', { exact: true }).last().waitFor();
  await settle(page);
  await clearToasts(page);
  await shot(page, 'retailPosManage-salesHistory-1');

  // Return one cake slice from the paid sale.
  await dialog(page)
    .getByRole('button', { name: /^Return BAK-000001/ })
    .click();
  await page.getByRole('dialog', { name: /^Return — / }).waitFor();
  await settle(page);
  await dialog(page)
    .getByRole('button', { name: /^Increase Chocolate/ })
    .click();
  await settle(page);
  await shot(page, 'retailPosManage-returnSale-1');
  await page.getByRole('button', { name: /^Refund LKR/ }).click();
  await enterPin(page, PINS.manager);
  await page.getByRole('dialog', { name: 'Why is this being returned?' }).waitFor();
  await pickReason(page, 'Customer returned item');
  await page.getByRole('dialog', { name: /^Return receipt/ }).waitFor();
  await settle(page, 600);
  await clearToasts(page);
  await shot(page, 'retailPosManage-returnSale-2');
  await page.keyboard.press('Escape');
  await settle(page);

  // Open the drawer outside a sale.
  await action(page, 'Open drawer').click();
  await enterPin(page, PINS.manager);
  await page.getByRole('dialog', { name: 'Why open the drawer?' }).waitFor();
  await dialog(page).getByRole('radio', { name: 'Change for customer' }).click();
  await clearToasts(page);
  await shot(page, 'retailPosManage-openDrawer-1');
  await dialog(page).getByRole('button', { name: 'Confirm' }).click();
  await settle(page);

  await page.context().close();
}
