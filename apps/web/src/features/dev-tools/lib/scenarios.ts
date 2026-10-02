import type { QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ScenarioId } from '@/mocks/config';
import { useSessionStore } from '@/stores/session-store';
import { devApi } from '../api/dev-api';

/**
 * Demo scenarios (SCN-001…009, 08_MOCK_SCENARIOS). Choosing one signs in as the role that
 * tells the story, at the right location/device, tops up any demo data through the normal API
 * (so it lands on the ledger and audit log like a real action) and opens the screen to look at.
 * Most of the data is already in the seed; "Reset mock data" restores it.
 */

/** Seed identifiers (mock mode only). */
const PILOT = 'T001';
const MAIN = 'loc_01MAIN';
const VAN = 'loc_01VAN1';
const COUNTER_POS = 'dev_01';

export interface ScenarioPlan {
  /** Role code of the pilot-tenant member to sign in as. */
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'FIELD_SALES';
  locationId: string;
  deviceId: string | null;
  /** Screen that demonstrates the scenario. */
  path: string;
  /** Puts the demo data in place when it isn't already (runs after signing in). */
  prepare?: () => Promise<void>;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/** Dine-in rounds for the busy lunch service; each goes to one free table. */
const BUSY_ROUNDS = [
  [
    { productId: 'prd_01K01', quantity: 2 },
    { productId: 'prd_01D02', quantity: 2 },
  ],
  [
    { productId: 'prd_01R04', quantity: 1 },
    { productId: 'prd_01K03', quantity: 1 },
    { productId: 'prd_01D03', quantity: 2 },
  ],
  [
    { productId: 'prd_01R01', quantity: 3 },
    { productId: 'prd_01D01', quantity: 3 },
  ],
  [
    { productId: 'prd_01K02', quantity: 1 },
    { productId: 'prd_01R02', quantity: 2 },
  ],
  [
    { productId: 'prd_01R05', quantity: 1, note: 'Less spicy' },
    { productId: 'prd_01D02', quantity: 1 },
  ],
];

/** SCN-002: fill free tables with orders sent to the kitchen; some tickets under way. */
export async function prepareBusyRestaurant(): Promise<void> {
  const tables = await api.tables.list();
  const occupied = tables.filter((t) => t.status !== 'FREE').length;
  const free = tables.filter((t) => t.status === 'FREE');
  const wanted = Math.max(0, BUSY_ROUNDS.length + 1 - occupied);
  for (const [i, table] of free.slice(0, wanted).entries()) {
    const lines = BUSY_ROUNDS[i % BUSY_ROUNDS.length] ?? [];
    try {
      const order = await api.orders.create({
        lines,
        adjustmentIds: [],
        status: 'OPEN',
        type: 'DINE_IN',
        tableId: table.id,
      });
      await api.orders.sendToKitchen(order.id);
    } catch {
      // An item may have run out (e.g. after other demos) — the other tables still fill.
    }
  }
  // Get the kitchen moving: the oldest tickets are being cooked, one is ready to serve.
  const waiting = (await api.kots.list()).filter((k) => k.status === 'NEW');
  const inProgress = waiting.slice(0, 3);
  for (const kot of inProgress) await api.kots.start(kot.id);
  if (inProgress[0]) await api.kots.ready(inProgress[0].id);
}

/** SCN-003: the seed has items under their minimum at Main; if they were restocked, raise a few minimums. */
export async function prepareLowStock(): Promise<void> {
  const stock = await api.inventory.list({ locationId: MAIN, pageSize: 100 });
  const short = stock.summary.low + stock.summary.out;
  if (short >= 3) return;
  const ok = stock.items.filter((l) => l.status === 'OK' && l.onHand > 0);
  for (const level of ok.slice(0, 3 - short)) {
    await api.inventory.setMinStock(level.productId, MAIN, { minStock: level.onHand + 5 });
  }
}

/** SCN-007: a paid sale from today at the counter to return (POS history lists today only). */
export async function prepareReturn(): Promise<void> {
  const paid = await api.orders.list({ status: 'PAID', from: startOfToday(), pageSize: 100 });
  if (
    paid.items.some(
      (o) => o.type === 'RETAIL' && o.lines.some((l) => l.returnedQuantity < l.quantity),
    )
  )
    return;
  const order = await api.orders.create({
    lines: [
      { productId: 'prd_01S01', quantity: 4 },
      { productId: 'prd_01S03', quantity: 2 },
    ],
    adjustmentIds: [],
    status: 'OPEN',
    type: 'RETAIL',
  });
  await api.orders.pay(order.id, { method: 'CASH', tendered: order.totals.total });
}

export const SCENARIO_PLANS: Record<ScenarioId, ScenarioPlan> = {
  'SCN-001': { role: 'OWNER', locationId: MAIN, deviceId: null, path: '/' },
  'SCN-002': {
    role: 'MANAGER',
    locationId: MAIN,
    deviceId: null,
    path: '/sales/tables',
    prepare: prepareBusyRestaurant,
  },
  'SCN-003': {
    role: 'MANAGER',
    locationId: MAIN,
    deviceId: null,
    path: '/inventory/low-stock',
    prepare: prepareLowStock,
  },
  'SCN-004': { role: 'MANAGER', locationId: MAIN, deviceId: null, path: '/production/prepared' },
  'SCN-005': {
    role: 'MANAGER',
    locationId: MAIN,
    deviceId: COUNTER_POS,
    path: '/staff/shifts?tab=drawer',
  },
  // Cashiers can't see reports: the route shows the 403 state instead of hiding (README).
  'SCN-006': { role: 'CASHIER', locationId: MAIN, deviceId: COUNTER_POS, path: '/reports/sales' },
  'SCN-007': {
    role: 'CASHIER',
    locationId: MAIN,
    deviceId: COUNTER_POS,
    path: '/pos',
    prepare: prepareReturn,
  },
  'SCN-008': {
    role: 'FIELD_SALES',
    locationId: VAN,
    deviceId: null,
    path: '/wholesale/field-sales',
  },
  'SCN-009': { role: 'MANAGER', locationId: MAIN, deviceId: null, path: '/sales/deliveries' },
};

/**
 * Sign in as the scenario's role, set location/device, prepare the data and return the path
 * to open. Throws if the role or tenant is missing (e.g. a trimmed seed).
 */
export async function applyScenario(id: ScenarioId, queryClient: QueryClient): Promise<string> {
  const plan = SCENARIO_PLANS[id];
  const tenant = (await devApi.tenants()).find((t) => t.code === PILOT);
  const members = tenant ? await devApi.members(tenant.id) : [];
  const member = members.find((m) => m.roleCode === plan.role);
  if (!member) throw new Error(`No ${plan.role} in ${PILOT}`);
  const session = useSessionStore.getState();
  const { accessToken } = await devApi.impersonate(member.tenantUserId);
  queryClient.clear();
  session.signIn(accessToken);
  session.setLocation(plan.locationId);
  session.setDevice(plan.deviceId);
  await plan.prepare?.();
  // Anything fetched while preparing is stale now.
  queryClient.clear();
  return plan.path;
}
