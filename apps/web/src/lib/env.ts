export type ApiMode = 'mock' | 'real';

const mode: ApiMode = import.meta.env.VITE_API_MODE === 'real' ? 'real' : 'mock';

export const env = {
  apiMode: mode,
  isMock: mode === 'mock',
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  /** Dev tools panel (tenant/location/role switcher) — mock mode only. */
  devtoolsEnabled: mode === 'mock' && import.meta.env.VITE_ENABLE_DEVTOOLS !== 'false',
} as const;
