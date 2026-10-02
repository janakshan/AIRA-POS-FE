import { describe, expect, it } from 'vitest';
import { checkAccess } from './access';

const me = { features: ['POS_RETAIL' as const], permissions: ['pos.sale.create' as const] };

describe('checkAccess', () => {
  it('allows when feature and permission are present', () => {
    expect(checkAccess(me, { feature: 'POS_RETAIL', permission: 'pos.sale.create' })).toEqual({
      allowed: true,
    });
  });

  it('reports a missing tenant feature before a missing permission', () => {
    expect(checkAccess(me, { feature: 'KOT', permission: 'kot.view' })).toMatchObject({
      reason: 'feature',
      feature: 'KOT',
    });
  });

  it('reports a missing permission', () => {
    expect(checkAccess(me, { permission: 'settings.manage' })).toMatchObject({
      reason: 'permission',
    });
  });

  it('denies everything when not loaded', () => {
    expect(checkAccess(undefined, { permission: 'dashboard.view' }).allowed).toBe(false);
    expect(checkAccess(undefined, {}).allowed).toBe(true);
  });
});
