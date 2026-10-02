import { cn } from '@rbp/utils';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useUiStore } from '@/stores/ui-store';

interface ScreenProps {
  /** Stable screen-catalog ID, e.g. "DASH-001". */
  id?: string;
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps every page: sets the document title and tags the DOM with the screen ID
 * so demo feedback and tests can reference screens reliably.
 */
export function Screen({ id, title, children, className }: ScreenProps) {
  const { t } = useTranslation();
  const showScreenIds = useUiStore((s) => s.showScreenIds);

  useEffect(() => {
    document.title = `${title} · ${t('appName')}`;
  }, [title, t]);

  return (
    <div data-screen-id={id} className={cn('relative', className)}>
      {showScreenIds && id && (
        <span className="pointer-events-none absolute -top-2 right-0 z-30 rounded bg-amber-400 px-1.5 py-0.5 font-mono text-[10px] font-bold text-black shadow">
          {id}
        </span>
      )}
      {children}
    </div>
  );
}
