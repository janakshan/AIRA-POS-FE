import type { LanguageCode } from '@rbp/types';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJsonStorage } from '@/lib/storage';

export type ThemeMode = 'light' | 'dark' | 'system';

interface UiState {
  sidebarCollapsed: boolean;
  theme: ThemeMode;
  /** User-chosen language. null = follow tenant default. */
  language: LanguageCode | null;
  showScreenIds: boolean;
  showQueryDevtools: boolean;
  toggleSidebar: () => void;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: LanguageCode | null) => void;
  setShowScreenIds: (show: boolean) => void;
  setShowQueryDevtools: (show: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: 'light',
      language: null,
      showScreenIds: false,
      showQueryDevtools: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setShowScreenIds: (showScreenIds) => set({ showScreenIds }),
      setShowQueryDevtools: (showQueryDevtools) => set({ showQueryDevtools }),
    }),
    {
      name: 'rbp.ui',
      storage: safeJsonStorage,
      version: 1,
      // v0 defaulted to 'system'; move those users onto the new light default once.
      migrate: (persisted, version) => {
        const state = persisted as Partial<UiState>;
        if (version < 1 && state.theme === 'system') state.theme = 'light';
        return state as UiState;
      },
    },
  ),
);
