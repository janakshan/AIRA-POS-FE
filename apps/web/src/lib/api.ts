import { createApiClient, createRbpApi } from '@rbp/api-client';
import i18n from '@/app/i18n';
import { env } from '@/lib/env';
import { useSessionStore } from '@/stores/session-store';

/**
 * Single API client for the app. In mock mode MSW intercepts these requests;
 * in real mode they go to the NestJS API. Components never know the difference.
 */
export const apiClient = createApiClient({
  baseUrl: env.apiBaseUrl,
  getContext: () => {
    const { accessToken, locationId, deviceId } = useSessionStore.getState();
    return { accessToken, locationId, deviceId, language: i18n.language };
  },
  onUnauthenticated: () => useSessionStore.getState().signOut(),
});

export const api = createRbpApi(apiClient);
