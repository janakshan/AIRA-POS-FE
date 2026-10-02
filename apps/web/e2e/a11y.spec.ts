import AxeBuilder from '@axe-core/playwright';
import { expect, openScreen, SCREENS, test } from './fixtures';

for (const theme of ['light', 'dark'] as const) {
  for (const screen of SCREENS) {
    test(`${screen.name} (${theme}): no serious accessibility violations`, async ({ page }) => {
      await openScreen(page, screen, { theme });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        // The dev tools tab and React Query devtools are prototype tooling, not product UI.
        .exclude('[aria-label="Dev tools"]')
        .analyze();
      const serious = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
        }));
      expect(serious).toEqual([]);
    });
  }
}
