import { describe, expect, it } from 'vitest';

// Raw file text: JSON.parse silently keeps the last of two equal keys, which is how a second
// `validation.locationRequired` once replaced the select-location message (AUTH-003).
const files = import.meta.glob<string>('../locales/*/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const countKeys = (v: unknown): number =>
  v && typeof v === 'object'
    ? Object.values(v).reduce<number>((n, x) => n + 1 + countKeys(x), 0)
    : 0;

describe('locale files', () => {
  it.each(Object.entries(files))('%s has no duplicate keys', (_path, raw) => {
    const written = raw.match(/"(?:[^"\\]|\\.)*"\s*:/g)?.length ?? 0;
    expect(countKeys(JSON.parse(raw))).toBe(written);
  });
});
