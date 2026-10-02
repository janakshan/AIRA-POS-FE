import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** localStorage that never throws (private mode, blocked storage, SSR/tests). */
const safeLocalStorage: StateStorage = {
  getItem: (name) => {
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      window.localStorage.setItem(name, value);
    } catch {
      /* ignore */
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};

export const safeJsonStorage = createJSONStorage(() => safeLocalStorage);
export { safeLocalStorage };
