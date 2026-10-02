import { expect, openScreen, SCREENS, test } from './fixtures';

const SECTIONS = [
  'foundations',
  'buttons',
  'forms',
  'tables',
  'dialogs',
  'status',
  'states',
  'pos',
  'navigation',
];

for (const screen of SCREENS) {
  test(`${screen.name}: no horizontal overflow or clipped text`, async ({ page }, info) => {
    await openScreen(page, screen);

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(overflow.doc, 'document scrolls horizontally').toBeLessThanOrEqual(overflow.viewport);
    expect(overflow.body, 'body scrolls horizontally').toBeLessThanOrEqual(overflow.viewport);

    // Text cut off by overflow:hidden without an ellipsis/line-clamp is a layout bug.
    const clipped = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(
        'h1,h2,h3,p,span,a,button,label,td,th,dt,dd',
      )) {
        if (!el.offsetParent || el.closest('[data-truncate],[aria-hidden=true],.sr-only')) continue;
        const style = getComputedStyle(el);
        const hides = style.overflowX === 'hidden' || style.overflowX === 'clip';
        const intentional = style.textOverflow === 'ellipsis' || style.webkitLineClamp !== 'none';
        if (
          hides &&
          !intentional &&
          el.scrollWidth > el.clientWidth + 1 &&
          el.textContent?.trim()
        ) {
          out.push(`${el.tagName.toLowerCase()} “${el.textContent.trim().slice(0, 40)}”`);
        }
      }
      return out;
    });
    expect(clipped, 'clipped text').toEqual([]);

    await page.screenshot({ path: `e2e/screenshots/${info.project.name}/${screen.name}.png` });

    if (screen.name === 'ui-kit') {
      for (const id of SECTIONS) {
        await page.locator(`#${id}`).scrollIntoViewIfNeeded();
        await page.evaluate(
          (s) => document.getElementById(s)?.scrollIntoView({ block: 'start' }),
          id,
        );
        await page.waitForTimeout(100);
        await page.screenshot({ path: `e2e/screenshots/${info.project.name}/ui-kit-${id}.png` });
      }
    }
  });
}

test('ui-kit: dark mode renders every section', async ({ page }, info) => {
  const kit = SCREENS.find((s) => s.name === 'ui-kit')!;
  await openScreen(page, kit, { theme: 'dark' });
  await expect(page.locator('html')).toHaveClass(/dark/);
  for (const id of ['foundations', 'forms', 'tables', 'pos']) {
    await page.evaluate((s) => document.getElementById(s)?.scrollIntoView({ block: 'start' }), id);
    await page.waitForTimeout(100);
    await page.screenshot({ path: `e2e/screenshots/${info.project.name}/dark-ui-kit-${id}.png` });
  }
});
