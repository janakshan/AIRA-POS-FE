import { persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { safeJsonStorage } from '@/lib/storage';

export type FailureMode = 'none' | 'network' | 'server' | 'unauthorized';

export const SCENARIOS = [
  { id: 'SCN-001', name: 'Normal Day' },
  { id: 'SCN-002', name: 'Busy Restaurant' },
  { id: 'SCN-003', name: 'Low Stock' },
  { id: 'SCN-004', name: 'Cancelled Prepared Food' },
  { id: 'SCN-005', name: 'Shift Handover' },
  { id: 'SCN-006', name: 'Permission Denied' },
  { id: 'SCN-007', name: 'Return / Refund' },
  { id: 'SCN-008', name: 'Wholesale Credit' },
  { id: 'SCN-009', name: 'Delivery' },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];

export interface MockConfig {
  latencyMs: number;
  failure: FailureMode;
  scenario: ScenarioId;
  set: (patch: Partial<Omit<MockConfig, 'set'>>) => void;
}

/** Controls how the mock API behaves. Only the dev tools panel writes to this. */
export const mockConfig = createStore<MockConfig>()(
  persist(
    (set) => ({
      latencyMs: 300,
      failure: 'none',
      scenario: 'SCN-001',
      set: (patch) => set(patch),
    }),
    { name: 'rbp.mock.config', storage: safeJsonStorage },
  ),
);
