import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

export async function startMockApi() {
  await worker.start({
    onUnhandledRequest(request, print) {
      // Only warn for API calls; ignore assets, fonts, HMR.
      if (new URL(request.url).pathname.startsWith('/api/')) print.warning();
    },
    quiet: false,
  });
}
