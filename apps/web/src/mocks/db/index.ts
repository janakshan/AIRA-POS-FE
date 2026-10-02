import { safeLocalStorage } from '@/lib/storage';
import { createSeed, DB_VERSION, type MockDb } from './seed';

const STORAGE_KEY = 'rbp.mock.db';

function load(): MockDb {
  const raw = safeLocalStorage.getItem(STORAGE_KEY);
  if (raw && typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as MockDb;
      if (parsed.version === DB_VERSION) return parsed;
    } catch {
      /* fall through to seed */
    }
  }
  return createSeed();
}

let state: MockDb = load();

/** In-memory mock database persisted to localStorage so demos survive reloads. */
export const db = {
  get: (): MockDb => state,
  /** Apply a mutation and persist. */
  update(mutator: (draft: MockDb) => void): void {
    mutator(state);
    void safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  },
  reset(): void {
    state = createSeed();
    void safeLocalStorage.removeItem(STORAGE_KEY);
  },
};

export type { MockDb } from './seed';
