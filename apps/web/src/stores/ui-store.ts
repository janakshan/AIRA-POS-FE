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
      theme: 'system',
      language: null,
      showScreenIds: false,
      showQueryDevtools: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setShowScreenIds: (showScreenIds) => set({ showScreenIds }),
      setShowQueryDevtools: (showQueryDevtools) => set({ showQueryDevtools }),
    }),
    { name: 'rbp.ui', storage: safeJsonStorage },
  ),
);
