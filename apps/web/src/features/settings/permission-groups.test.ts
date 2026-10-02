import { PERMISSION_GROUPS, PERMISSIONS } from '@rbp/types';
import { describe, expect, it } from 'vitest';
import en from '@/locales/en/settings.json';

describe('SET-004 permission grid', () => {
  it('shows every permission exactly once, with a label and hint', () => {
    const grouped = PERMISSION_GROUPS.flatMap((g) => g.permissions);
    expect([...grouped].sort()).toEqual([...PERMISSIONS].sort());
    for (const p of PERMISSIONS) {
      expect(en.permissions[p]).toMatchObject({
        label: expect.any(String),
        hint: expect.any(String),
      });
    }
    for (const g of PERMISSION_GROUPS) expect(en.groups).toHaveProperty(g.key);
  });
});
