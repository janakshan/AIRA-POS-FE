import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { api } from '@/lib/api';
import { SCENARIOS } from '@/mocks/config';
import { useSessionStore } from '@/stores/session-store';
import { applyScenario, SCENARIO_PLANS } from './scenarios';

const apply = (id: (typeof SCENARIOS)[number]['id']) => applyScenario(id, new QueryClient());

describe('dev tools: demo scenarios (SCN-001…009)', () => {
  it('every scenario signs in as its role at its location and opens its screen', async () => {
    for (const { id } of SCENARIOS) {
      const plan = SCENARIO_PLANS[id];
      expect(await apply(id)).toBe(plan.path);
      const me = await api.identity.me();
      expect(me.roles.map((r) => r.code)).toContain(plan.role);
      expect(me.currentLocation?.id).toBe(plan.locationId);
      expect(useSessionStore.getState().deviceId).toBe(plan.deviceId);
    }
  });

  it('SCN-002 fills tables and puts tickets on the kitchen board', async () => {
    await apply('SCN-002');
    const tables = await api.tables.list();
    expect(tables.filter((t) => t.status !== 'FREE').length).toBeGreaterThanOrEqual(5);
    const kots = await api.kots.list();
    expect(kots.filter((k) => k.status === 'NEW').length).toBeGreaterThan(0);
    expect(kots.filter((k) => k.status === 'PREPARING').length).toBeGreaterThan(0);
    expect(kots.filter((k) => k.status === 'READY')).toHaveLength(1);
    // Running it again tops up rather than piling on.
    await apply('SCN-002');
    expect((await api.tables.list()).filter((t) => t.status !== 'FREE').length).toBe(
      tables.filter((t) => t.status !== 'FREE').length,
    );
  });

  it('SCN-003 keeps items under their minimum even after they were restocked', async () => {
    await apply('SCN-003');
    const before = await api.inventory.list({ locationId: 'loc_01MAIN', pageSize: 100 });
    expect(before.summary.low + before.summary.out).toBeGreaterThanOrEqual(3);
    // Restock everything that's short by lowering its minimum, then set up again.
    for (const l of before.items.filter((x) => x.status !== 'OK')) {
      await api.inventory.setMinStock(l.productId, 'loc_01MAIN', { minStock: 0 });
    }
    await apply('SCN-003');
    const after = await api.inventory.list({ locationId: 'loc_01MAIN', pageSize: 100 });
    expect(after.summary.low + after.summary.out).toBeGreaterThanOrEqual(3);
  });

  it('SCN-007 leaves a paid sale from today to return', async () => {
    await apply('SCN-007');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paid = await api.orders.list({ status: 'PAID', from: today.toISOString() });
    expect(paid.items.some((o) => o.type === 'RETAIL')).toBe(true);
  });

  it('SCN-006 signs in a role that is refused reports', async () => {
    await apply('SCN-006');
    const me = await api.identity.me();
    expect(me.permissions).not.toContain('report.sales.view');
  });
});
