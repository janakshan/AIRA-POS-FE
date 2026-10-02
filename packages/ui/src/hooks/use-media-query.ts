import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Breakpoints (validated targets: desktop 1366×768, tablet 1024×768, mobile 390×844).
 * mobile < 768 ≤ tablet < 1280 ≤ desktop
 */
export const BREAKPOINTS = { tablet: 768, desktop: 1280 } as const;

export const useIsMobile = () => !useMediaQuery(`(min-width: ${BREAKPOINTS.tablet}px)`);
export const useIsDesktop = () => useMediaQuery(`(min-width: ${BREAKPOINTS.desktop}px)`);
