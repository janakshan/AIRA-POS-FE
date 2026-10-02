import type { EmployeeVerification } from '@rbp/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJsonStorage } from '@/lib/storage';

/**
 * Client-side session context. Server data (user, tenant, permissions) lives in
 * TanStack Query (`useMe`) — this store only holds identifiers the client must send.
 */
interface SessionState {
  accessToken: string | null;
  locationId: string | null;
  deviceId: string | null;
  /** Last employee verified by PIN on this device (not persisted). */
  lastVerification: EmployeeVerification | null;
  signIn: (accessToken: string) => void;
  setLocation: (locationId: string | null) => void;
  setDevice: (deviceId: string | null) => void;
  setLastVerification: (v: EmployeeVerification | null) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      accessToken: null,
      locationId: null,
      deviceId: null,
      lastVerification: null,
      signIn: (accessToken) => set({ accessToken, lastVerification: null }),
      setLocation: (locationId) => set({ locationId }),
      setDevice: (deviceId) => set({ deviceId }),
      setLastVerification: (lastVerification) => set({ lastVerification }),
      signOut: () => set({ accessToken: null, locationId: null, lastVerification: null }),
    }),
    {
      name: 'rbp.session',
      storage: safeJsonStorage,
      partialize: ({ accessToken, locationId, deviceId }) => ({
        accessToken,
        locationId,
        deviceId,
      }),
    },
  ),
);
