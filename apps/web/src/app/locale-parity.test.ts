import { describe, expect, it } from 'vitest';
import enCommon from '@/locales/en/common.json';
import enNav from '@/locales/en/nav.json';
import enSettings from '@/locales/en/settings.json';
import siCommon from '@/locales/si/common.json';
import siNav from '@/locales/si/nav.json';
import siSettings from '@/locales/si/settings.json';
import taCommon from '@/locales/ta/common.json';
import taNav from '@/locales/ta/nav.json';
import taSettings from '@/locales/ta/settings.json';
import { NAV_GROUPS } from '@/navigation/nav-config';

/** "a.b.c" → value, for every string leaf. */
function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (acc, [k, v]) => ({ ...acc, ...flatten(v, prefix ? `${prefix}.${k}` : k) }),
    {},
  );
}

const placeholders = (text: string) =>
  [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

const pick = (all: Record<string, string>, prefixes: string[]) =>
  Object.fromEntries(Object.entries(all).filter(([k]) => prefixes.some((p) => k.startsWith(p))));

/** Settings (SET-*) ships fully translated: every key, with the same {{placeholders}}. */
describe.each([
  ['ta', taSettings, taCommon, taNav],
  ['si', siSettings, siCommon, siNav],
] as const)('%s Settings translation', (_lang, settings, common, nav) => {
  it('has exactly the English settings keys and placeholders', () => {
    const en = flatten(enSettings);
    const tr = flatten(settings);
    expect(Object.keys(tr).sort()).toEqual(Object.keys(en).sort());
    for (const [key, text] of Object.entries(en)) {
      expect({ key, vars: placeholders(tr[key]!) }).toEqual({ key, vars: placeholders(text) });
      expect({ key, translated: tr[key]!.trim().length > 0 }).toEqual({ key, translated: true });
    }
  });

  it('has the validation and error messages the settings screens show', () => {
    const en = pick(flatten(enCommon), ['errorReasons.', 'errors.', 'features.']);
    const tr = flatten(common);
    for (const [key, text] of Object.entries(en)) {
      expect({ key, vars: placeholders(tr[key] ?? '∅') }).toEqual({
        key,
        vars: placeholders(text),
      });
    }
    // Validation keys raised by the settings schemas and handlers.
    for (const key of [
      'nameMin',
      'nameMax',
      'codeTaken',
      'emailTaken',
      'employeeHasLogin',
      'nameTaken',
      'methodOff',
      'passwordMin8',
      'rolesRequired',
      'permissionsRequired',
      'servicePercent',
      'onlyServiceAutomatic',
      'chargeDefaultRequired',
      'defaultLanguageOff',
      'logoTextMax',
    ]) {
      expect(tr).toHaveProperty([`validation.${key}`]);
    }
  });

  it('names every Settings menu item', () => {
    const items = NAV_GROUPS.find((g) => g.key === 'settings')!.items.map((i) => i.key);
    const tr = flatten(nav);
    for (const key of items) expect(tr).toHaveProperty([`items.${key}`]);
    expect(Object.keys(flatten(enNav)).length).toBeGreaterThan(0);
  });
});
