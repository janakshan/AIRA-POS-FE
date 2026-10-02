import i18n from 'i18next';
import type { RouteObject } from 'react-router';

/** Guide copy is large, so it loads with the page instead of the main bundle. */
async function loadGuideText() {
  if (i18n.hasResourceBundle('en', 'guide')) return;
  const [en, ta, si] = await Promise.all([
    import('@/locales/en/guide.json'),
    import('@/locales/ta/guide.json'),
    import('@/locales/si/guide.json'),
  ]);
  i18n.addResourceBundle('en', 'guide', en.default);
  i18n.addResourceBundle('ta', 'guide', ta.default);
  i18n.addResourceBundle('si', 'guide', si.default);
}

/** HELP-001 public user guide (lazy). Outside the auth guards so clients can open it without signing in. */
export const guideRoute: RouteObject = {
  path: '/guide',
  lazy: async () => {
    const [{ GuidePage }] = await Promise.all([import('./pages/guide-page'), loadGuideText()]);
    return { Component: GuidePage };
  },
};
