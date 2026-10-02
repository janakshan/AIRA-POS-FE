import type { GuideRole } from '../guide-types';

export type AccessLevel = 'full' | 'limited' | 'none';

/** Who can open each area. Mirrors the role permissions and nav gates (navigation/nav-config.ts). */
export const ROLE_MATRIX: { area: string; access: Record<GuideRole, AccessLevel> }[] = [
  row('dashboard', 'FFFF-FF'),
  row('retailPos', 'FFFF---'),
  row('restaurant', 'FFLF---'),
  row('kitchen', 'FF-LF--'),
  row('deliveries', 'FFF--L-'),
  row('catalog', 'FFLL---'),
  row('customers', 'FFFL---'),
  row('inventory', 'FFL-L-L'),
  row('purchasing', 'FF-----'),
  row('production', 'FF--L--'),
  row('wholesale', 'FF----F'),
  row('staff', 'FF-----'),
  row('reports', 'FF-----'),
  row('settings', 'F------'),
];

/** Compact access code, one letter per role in GUIDE_ROLES order: F full, L limited, - none. */
function row(area: string, code: string) {
  const roles: GuideRole[] = ['owner', 'manager', 'cashier', 'waiter', 'kitchen', 'rider', 'rep'];
  const level = { F: 'full', L: 'limited', '-': 'none' } as const;
  return {
    area,
    access: Object.fromEntries(
      roles.map((r, i) => [r, level[code[i] as keyof typeof level]]),
    ) as Record<GuideRole, AccessLevel>,
  };
}
