/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `mock` serves /api/v1 from MSW in the browser; `real` calls VITE_API_BASE_URL (NestJS). */
  readonly VITE_API_MODE?: 'mock' | 'real';
  /** Empty = same origin. */
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_ENABLE_DEVTOOLS?: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
