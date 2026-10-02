import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import '@/app/i18n';
import { mockConfig } from '@/mocks/config';
import { db } from '@/mocks/db';
import { server } from '@/mocks/node';
import { usePinPromptStore } from '@/features/auth/store/pin-prompt-store';
import { useReasonPromptStore } from '@/features/auth/store/reason-prompt-store';
import { useDispositionPromptStore } from '@/features/pos/store/disposition-prompt-store';
import { useCartStore } from '@/features/pos/store/cart-store';
import { useSessionStore } from '@/stores/session-store';

// jsdom lacks matchMedia.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addEventListener: () => {},
  removeEventListener: () => {},
  addListener: () => {},
  removeListener: () => {},
  dispatchEvent: () => false,
})) as typeof window.matchMedia;

beforeAll(() => {
  mockConfig.getState().set({ latencyMs: 0, failure: 'none' });
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  db.reset();
  useSessionStore.setState({
    accessToken: null,
    locationId: null,
    deviceId: null,
    lastVerification: null,
  });
  useCartStore.setState({ carts: {} });
  usePinPromptStore.setState({ prompt: null });
  useReasonPromptStore.setState({ prompt: null });
  useDispositionPromptStore.setState({ prompt: null });
  localStorage.clear();
});
afterAll(() => server.close());

// jsdom lacks ResizeObserver (used by Radix radio/checkbox sizing).
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

// jsdom lacks pointer capture / scrollIntoView (used by Radix Select).
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
