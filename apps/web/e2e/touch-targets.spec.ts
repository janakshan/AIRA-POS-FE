import { expect, openScreen, SCREENS, test } from './fixtures';

/**
 * Touch viewports only: every interactive control ≥44×44 (including ::after hit-area
 * extensions), POS controls ([data-touch=pos]) ≥56 in their smaller dimension.
 */
test.beforeEach(({}, info) => {
  test.skip(info.project.name === 'desktop', 'touch targets apply to touch viewports');
});

for (const screen of SCREENS) {
  test(`${screen.name}: touch targets`, async ({ page }) => {
    await openScreen(page, screen);
    const problems = await page.evaluate(() => {
      const MIN = 44;
      const POS_MIN = 56;
      const out: string[] = [];
      const selector =
        'button, a[href], [role=button], [role=tab], [role=radio], [role=checkbox], [role=switch], [role=combobox], input:not([type=hidden]), select, textarea';
      for (const el of document.querySelectorAll<HTMLElement>(selector)) {
        if (el.closest('.sr-only, [aria-hidden=true], [data-touch-exempt], [inert]')) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // Inputs inside a composite control are measured by their wrapper.
        if (el.matches('input') && el.closest('[data-slot=number-input],[data-slot=money-input]'))
          continue;
        // Inline links inside running text are exempt (WCAG 2.5.8).
        if (el.matches('a') && el.closest('p') && style.display === 'inline') continue;

        let { width, height } = rect;
        const after = getComputedStyle(el, '::after');
        if (after.content !== 'none' && after.position === 'absolute') {
          const n = (v: string) => (v.endsWith('px') ? parseFloat(v) : 0);
          width += Math.max(0, -n(after.left)) + Math.max(0, -n(after.right));
          height += Math.max(0, -n(after.top)) + Math.max(0, -n(after.bottom));
        }
        const pos = el.dataset.touch === 'pos';
        const min = pos ? POS_MIN : MIN;
        const small = pos
          ? Math.min(width, height) < min - 0.5
          : width < MIN - 0.5 || height < MIN - 0.5;
        if (small) {
          const name = (el.getAttribute('aria-label') ?? el.textContent ?? el.tagName)
            .trim()
            .slice(0, 30);
          out.push(
            `${pos ? 'POS ' : ''}${el.tagName.toLowerCase()} “${name}” ${Math.round(width)}×${Math.round(height)}`,
          );
        }
      }
      return [...new Set(out)];
    });
    expect(problems, 'controls below touch minimum').toEqual([]);
  });
}
