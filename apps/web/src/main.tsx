import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import './app/i18n';
import './styles.css';
import { AppProviders } from './app/providers';
import { router } from './app/router';
import { env } from './lib/env';

async function bootstrap() {
  if (env.isMock) {
    const { startMockApi } = await import('./mocks/browser');
    await startMockApi();
  } else if ('serviceWorker' in navigator) {
    // PWA app-shell caching (online-first). Disabled in mock mode so it can't conflict with MSW.
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  }

  const container = document.getElementById('root');
  if (!container) throw new Error('#root element missing');
  createRoot(container).render(
    <StrictMode>
      <AppProviders>
        <RouterProvider router={router} />
      </AppProviders>
    </StrictMode>,
  );
}

void bootstrap();
