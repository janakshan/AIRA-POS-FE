import { expect, openScreen, SCREENS, test } from './fixtures';

const dashboard = SCREENS.find((s) => s.name === 'dashboard')!;

test('navigation shell adapts to the viewport', async ({ page }, info) => {
  await openScreen(page, dashboard);
  const aside = page.locator('aside').first();
  const menuButton = page.getByRole('button', { name: 'Open menu' });

  if (info.project.name === 'desktop') {
    await expect(aside).toBeVisible();
    expect((await aside.boundingBox())!.width).toBeGreaterThanOrEqual(240);
    await expect(aside.getByRole('link', { name: 'Dashboard' })).toBeVisible();
    await expect(menuButton).toBeHidden();
  } else if (info.project.name === 'tablet') {
    await expect(aside).toBeVisible();
    expect((await aside.boundingBox())!.width).toBeLessThanOrEqual(80);
    await expect(menuButton).toBeHidden();
    // Rail group opens a flyout menu.
    await aside.getByRole('button', { name: 'Catalog' }).click();
    await page.getByRole('menuitem', { name: 'Products', exact: true }).click();
    await expect(page).toHaveURL(/\/catalog\/products$/);
  } else {
    await expect(aside).toBeHidden();
    await menuButton.click();
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Catalog' }).click();
    await drawer.getByRole('link', { name: 'Products', exact: true }).click();
    await expect(page).toHaveURL(/\/catalog\/products$/);
    await expect(drawer).toBeHidden();
  }
});

test('active page is marked for assistive tech and breadcrumbs match', async ({ page }) => {
  await openScreen(page, {
    name: 'products',
    path: '/catalog/products',
    screenId: 'CAT-003',
    as: 'owner@pilot.demo',
  });
  const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
  await expect(crumbs).toContainText('Catalog');
  await expect(crumbs.locator('[aria-current=page]')).toHaveText('Products');
});

test('skip link moves focus to main content', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'keyboard flow checked on desktop');
  await openScreen(page, dashboard);
  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('account menu language and theme choices stay on screen', async ({ page }) => {
  await openScreen(page, dashboard);
  const width = page.viewportSize()!.width;
  await page.getByRole('button', { name: 'Account' }).click();
  // Phones list them inline; wider screens open sub-menus beside the menu.
  const sub = page.getByRole('menuitem', { name: 'Language' });
  if (await sub.isVisible()) await sub.click();
  const tamil = page.getByRole('menuitemradio', { name: 'தமிழ்' });
  await expect(tamil).toBeVisible();
  for (const item of await page.getByRole('menuitemradio').all()) {
    const box = (await item.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await tamil.click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'ta');
});
