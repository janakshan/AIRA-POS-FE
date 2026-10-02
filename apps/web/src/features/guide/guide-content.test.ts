import { describe, expect, it } from 'vitest';
import en from '@/locales/en/guide.json';
import si from '@/locales/si/guide.json';
import ta from '@/locales/ta/guide.json';
import { ROLE_MATRIX } from './content/roles';
import { COMING_SOON, GUIDE_SECTIONS } from './guide-content';
import { GUIDE_ROLES } from './guide-types';

// Only the file names are needed: the lazy importers are never called.
const SHOT_FILES = Object.keys(import.meta.glob('../../../public/guide/shots/*.jpg')).map((p) =>
  p.replace(/^.*\/|\.jpg$/g, ''),
);

const get = (obj: unknown, path: string): unknown =>
  path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);

/** Every text key the guide renders (optional task intro/note excluded). */
function requiredKeys(): string[] {
  const keys = ['page.title', 'roles.title', 'comingSoon.title'];
  for (const s of GUIDE_SECTIONS) {
    const b = `sections.${s.key}`;
    keys.push(`${b}.title`, `${b}.intro`);
    for (const t of s.tasks) {
      keys.push(`${b}.tasks.${t.key}.title`);
      for (const st of t.steps) keys.push(`${b}.tasks.${t.key}.steps.${st.key}`);
    }
  }
  for (const r of GUIDE_ROLES) keys.push(`roles.names.${r}`);
  for (const row of ROLE_MATRIX) keys.push(`roles.areas.${row.area}`);
  for (const c of COMING_SOON)
    keys.push(`comingSoon.items.${c}.title`, `comingSoon.items.${c}.body`);
  return keys;
}

/** Leaf paths of a locale object. */
function leaves(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k));
}

describe('user guide content', () => {
  it('has unique section, task and step keys', () => {
    const sections = GUIDE_SECTIONS.map((s) => s.key);
    expect(new Set(sections).size).toBe(sections.length);
    for (const s of GUIDE_SECTIONS) {
      const tasks = s.tasks.map((t) => t.key);
      expect(new Set(tasks).size, s.key).toBe(tasks.length);
      for (const t of s.tasks) {
        const steps = t.steps.map((st) => st.key);
        expect(new Set(steps).size, `${s.key}.${t.key}`).toBe(steps.length);
      }
    }
  });

  it('has English text for every key it renders', () => {
    const missing = requiredKeys().filter((k) => typeof get(en, k) !== 'string' || !get(en, k));
    expect(missing).toEqual([]);
  });

  it('uses only <b> markup in the text', () => {
    const bad = leaves(en).filter((k) => /<(?!\/?b>)/.test(String(get(en, k))));
    expect(bad).toEqual([]);
  });

  it('has no Tamil or Sinhala keys that English lacks', () => {
    for (const locale of [ta, si]) {
      expect(leaves(locale).filter((k) => get(en, k) === undefined)).toEqual([]);
    }
  });

  it('has a screenshot file for every shot, and no unused files', () => {
    const shots = GUIDE_SECTIONS.flatMap((s) => s.tasks.flatMap((t) => t.steps))
      .map((st) => st.shot)
      .filter((s): s is string => !!s);
    expect(new Set(shots).size).toBe(shots.length);
    expect(shots.filter((s) => !SHOT_FILES.includes(s))).toEqual([]);
    expect(SHOT_FILES.filter((f) => !shots.includes(f))).toEqual([]);
  });
});
