import { lazy, Suspense } from 'react';
import { Outlet, ScrollRestoration } from 'react-router';
import { EmployeePinDialog } from '@/features/auth/components/employee-pin-dialog';
import { ReasonPromptDialog } from '@/features/auth/components/reason-prompt-dialog';
import { env } from '@/lib/env';
import { AppEffects } from './app-effects';

const DevToolsPanel = env.devtoolsEnabled
  ? lazy(() =>
      import('@/features/dev-tools/components/dev-tools-panel').then((m) => ({
        default: m.DevToolsPanel,
      })),
    )
  : null;

/** Root route: app-wide effects and singletons that need router context. */
export function RootLayout() {
  return (
    <>
      <AppEffects />
      <Outlet />
      <EmployeePinDialog />
      <ReasonPromptDialog />
      {DevToolsPanel && (
        <Suspense fallback={null}>
          <DevToolsPanel />
        </Suspense>
      )}
      <ScrollRestoration />
    </>
  );
}
