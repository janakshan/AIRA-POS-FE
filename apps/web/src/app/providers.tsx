import { FormMessageTranslator, Toaster, TooltipProvider } from '@rbp/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { lazy, type ReactNode, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '@/lib/use-media-query';
import { useUiStore } from '@/stores/ui-store';
import { queryClient } from './query-client';

const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })),
    )
  : null;

/** Toggled from the prototype dev tools panel so its floating button doesn't cover the UI. */
function QueryDevtools() {
  const show = useUiStore((s) => s.showQueryDevtools);
  if (!ReactQueryDevtools || !show) return null;
  return (
    <Suspense fallback={null}>
      <ReactQueryDevtools initialIsOpen buttonPosition="bottom-left" />
    </Suspense>
  );
}

function ThemedToaster() {
  const theme = useUiStore((s) => s.theme);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
  return <Toaster theme={resolved} position="top-center" />;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <FormMessageTranslator value={(key) => t(key)}>{children}</FormMessageTranslator>
        <ThemedToaster />
      </TooltipProvider>
      <QueryDevtools />
    </QueryClientProvider>
  );
}
