/* global document */
import { EMAILS, PINS, enterPin, login, newPage, settle, shot } from './lib.mjs';

/** Drop focus so no field shows a selection or focus ring in the shot. */
const blur = (page) => page.evaluate(() => document.activeElement?.blur());
/** Wait until toasts have gone. */
const noToasts = (page) =>
  page
    .locator('[data-sonner-toast]')
    .first()
    .waitFor({ state: 'detached', timeout: 8000 })
    .catch(() => {});

/** Production: recipes & kitchen prep (Main Restaurant) and bakery production (Bakery Outlet). */
export default async function production() {
  await kitchen();
  await bakery();
}

async function kitchen() {
  const page = await newPage();
  await login(page, EMAILS.manager, { location: 'Main' });

  // Ingredients: the list, then edit a seeded ingredient (never a new one).
  await page.goto('/production/ingredients');
  await settle(page);
  await shot(page, 'recipesKitchen-ingredients-1');
  await page.getByRole('button', { name: 'Edit Chicken' }).click();
  const ingDialog = page.getByRole('dialog');
  await ingDialog.waitFor();
  await ingDialog.getByLabel('Minimum at Main Restaurant').fill('24');
  await blur(page);
  await shot(page, 'recipesKitchen-ingredients-2', { locator: ingDialog });
  await ingDialog.getByRole('button', { name: 'Close' }).first().click();
  await ingDialog.waitFor({ state: 'detached' });

  // Recipes: "Can make" table, then the list of items without a recipe.
  await page.goto('/production/recipes');
  await settle(page);
  await shot(page, 'recipesKitchen-canMake-1');
  await page.getByRole('heading', { name: 'Menu items without a recipe' }).scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 250);
  await shot(page, 'recipesKitchen-recipe-1');

  // New recipe for Chicken Kottu from seeded ingredients.
  await page.getByRole('link', { name: 'Add a recipe for Chicken Kottu' }).click();
  await page.waitForURL(/recipes\/new/);
  await settle(page);
  const addIngredient = async (name, qty = 1) => {
    await page.getByRole('combobox', { name: 'Add ingredient' }).click();
    await page.getByRole('option', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Add ingredient' }).click();
    if (qty !== 1) {
      const input = page.getByLabel(`Quantity of ${name}`);
      await input.fill(String(qty));
      await blur(page);
    }
  };
  await addIngredient('Chicken');
  await addIngredient('Egg');
  await addIngredient('Vegetables');
  await page.getByLabel('Note').fill('One chicken portion and one egg per plate');
  await blur(page);
  await shot(page, 'recipesKitchen-recipe-2');

  // Portions & planning.
  await page.goto('/production/portions');
  await settle(page);
  await shot(page, 'recipesKitchen-portions-1');
  const expected = page.getByLabel('Expected sales of Chicken Rice & Curry');
  await expected.fill('40');
  await blur(page);
  await page.getByRole('heading', { name: "Today's requirement" }).scrollIntoViewIfNeeded();
  await page
    .getByRole('heading', { name: "Today's requirement" })
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.mouse.wheel(0, -40);
  await shot(page, 'recipesKitchen-portions-2');

  // Prepared items: the queue, add one, dispose of the expired one.
  await page.goto('/production/prepared');
  await settle(page);
  await shot(page, 'recipesKitchen-prepared-1');
  await page.getByRole('button', { name: 'Add prepared item' }).click();
  const addDialog = page.getByRole('dialog');
  await addDialog.waitFor();
  await addDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Vegetable Rice & Curry' }).click();
  await addDialog.getByLabel('Quantity').fill('2');
  await blur(page);
  await shot(page, 'recipesKitchen-prepared-2', { locator: addDialog });
  await addDialog.getByRole('button', { name: 'Close' }).first().click();
  await addDialog.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'Dispose of Egg Fried Rice' }).click();
  const disposeDialog = page.getByRole('dialog');
  await disposeDialog.waitFor();
  await shot(page, 'recipesKitchen-prepared-3', { locator: disposeDialog });
  await page.context().close();
}

async function bakery() {
  const page = await newPage();
  await login(page, EMAILS.manager, { location: 'Bakery Outlet' });

  await page.goto('/production/bakery');
  await settle(page);
  await shot(page, 'bakeryProduction-overview-1');

  // New plan for tomorrow.
  await page.goto('/production/plan/new');
  await settle(page);
  const plan = async (name, qty) => {
    const input = page.getByLabel(`Planned ${name}`);
    await input.fill(String(qty));
    await blur(page);
  };
  await plan('Butter Cake Slice', 24);
  await plan('Chocolate Cake Slice', 12);
  await page.getByLabel('Note').fill('Extra cake for the weekend');
  await blur(page);
  await shot(page, 'bakeryProduction-plan-1');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await page.waitForURL(/\/production\/plan\/[^/]+$/);
  await settle(page);
  await page.getByRole('button', { name: 'Confirm plan' }).click();
  await settle(page, 600);
  await noToasts(page);
  await shot(page, 'bakeryProduction-plan-2');

  // Batches list, then start the new Butter Cake batch.
  await page.goto('/production/batches');
  await settle(page);
  await shot(page, 'bakeryProduction-startBatch-1');
  await page
    .getByRole('button', { name: /^Start BAT-\d+ Butter Cake Slice/ })
    .first()
    .click();
  const startDialog = page.getByRole('dialog');
  await startDialog.waitFor();
  await blur(page);
  await shot(page, 'bakeryProduction-startBatch-2', { locator: startDialog });
  await startDialog.getByRole('button', { name: 'Start batch' }).click();
  await startDialog.waitFor({ state: 'detached' });
  await settle(page);

  // Record output of today's Chocolate Cake batch with two rejects.
  await page
    .getByRole('button', { name: /^Record output of BAT-\d+ Chocolate Cake Slice/ })
    .first()
    .click();
  const outDialog = page.getByRole('dialog');
  await outDialog.waitFor();
  const good = outDialog.getByRole('spinbutton', { name: 'Good units' });
  await good.fill('22');
  const rejected = outDialog.getByRole('spinbutton', { name: 'Rejected' });
  await rejected.fill('2');
  await blur(page);
  await outDialog.getByRole('combobox').click();
  await page.getByRole('option', { name: 'Burnt / over-baked' }).click();
  await outDialog.getByLabel(/Comment/).fill('Top tray too close');
  await shot(page, 'bakeryProduction-recordOutput-1', { locator: outDialog });
  const batchNo = (await outDialog.getByRole('heading').first().innerText()).match(/BAT-\d+/)?.[0];
  await outDialog.getByRole('button', { name: 'Record output' }).click();
  await outDialog.waitFor({ state: 'detached' });
  await settle(page);
  await page
    .getByRole('row', { name: new RegExp(batchNo) })
    .first()
    .click();
  await page.waitForURL(/\/production\/batches\/[^/]+$/);
  await settle(page);
  await noToasts(page);
  await shot(page, 'bakeryProduction-recordOutput-2');

  // Finished goods, then write off bread with a manager PIN and a reason.
  await page.goto('/production/finished-goods');
  await settle(page);
  await shot(page, 'bakeryProduction-finishedGoods-1');
  await page.getByRole('button', { name: 'Write off Sandwich Bread (450g)' }).click();
  const woDialog = page.getByRole('dialog');
  await woDialog.waitFor();
  await woDialog.getByRole('spinbutton', { name: 'Quantity to write off' }).fill('3');
  await woDialog.getByLabel('Note').fill('Past its best-before date');
  await blur(page);
  await shot(page, 'bakeryProduction-wastage-1', { locator: woDialog });
  await woDialog.getByRole('button', { name: 'Write off' }).click();
  await enterPin(page, PINS.manager);
  await settle(page, 600);
  const reasonDialog = page.getByRole('dialog').last();
  await reasonDialog
    .getByRole('radio', { name: /Expired/ })
    .first()
    .click();
  await noToasts(page);
  await shot(page, 'bakeryProduction-wastage-2', { locator: reasonDialog });
  await reasonDialog
    .getByRole('button', { name: /Confirm|Continue|Write off/ })
    .last()
    .click();
  await settle(page, 800);

  await page.goto('/production/wastage');
  await settle(page);
  await shot(page, 'bakeryProduction-wastage-3');
  await page.context().close();
}
