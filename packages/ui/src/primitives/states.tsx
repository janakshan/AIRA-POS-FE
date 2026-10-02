import {
  AlertCircleIcon,
  AlertTriangleIcon,
  WifiOffIcon,
  InboxIcon,
  Loader2Icon,
  RotateCwIcon,
  ShieldAlertIcon,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { cn } from '@rbp/utils';
import { Button } from '../components/button';
import { Skeleton } from '../components/skeleton';

interface StateShellProps {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  iconClassName?: string;
}

function StateShell({
  icon: Icon,
  title,
  description,
  action,
  className,
  iconClassName,
}: StateShellProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground',
          iconClassName,
        )}
      >
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{title}</p>
        {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState(props: Omit<StateShellProps, 'icon'> & { icon?: LucideIcon }) {
  return <StateShell icon={props.icon ?? InboxIcon} {...props} />;
}

export interface ErrorStateProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Stable error code / request id shown for support. */
  code?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  code,
  onRetry,
  retryLabel = 'Try again',
  className,
}: ErrorStateProps) {
  return (
    <StateShell
      icon={AlertTriangleIcon}
      iconClassName="bg-destructive/10 text-destructive"
      className={className}
      title={title}
      description={
        <>
          {description}
          {code && <span className="mt-1 block font-mono text-xs opacity-70">{code}</span>}
        </>
      }
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            <RotateCwIcon /> {retryLabel}
          </Button>
        )
      }
    />
  );
}

export function ForbiddenState({
  title = 'Access denied',
  description,
  action,
  className,
}: Omit<StateShellProps, 'icon'>) {
  return (
    <StateShell
      icon={ShieldAlertIcon}
      iconClassName="bg-status-warning/15 text-status-warning"
      title={title}
      description={description}
      action={action}
      className={className}
    />
  );
}

export function LoadingState({
  label = 'Loading…',
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground',
        className,
      )}
    >
      <Loader2Icon className="size-4 animate-spin" />
      {label}
    </div>
  );
}

export function FullPageLoader({ label }: { label?: string }) {
  return <LoadingState label={label} className="min-h-dvh" />;
}

/** Skeleton grid for card-style dashboards. */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}

/** Rows of skeleton cells matching a table layout. */
export function TableSkeleton({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Loading" className="divide-y rounded-xl border bg-card">
      <div className="flex gap-4 p-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-4 p-3.5">
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={cn('h-4 flex-1', c === 0 && 'max-w-48')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div role="status" aria-label="Loading" className="grid gap-5 sm:grid-cols-2">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Whole-page placeholder: header, stat cards and a content block. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading" className="space-y-section">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <CardGridSkeleton />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/** Small error line for a widget or field group, with optional retry. */
export function InlineError({
  message,
  onRetry,
  retryLabel = 'Retry',
  className,
}: {
  message: React.ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div role="alert" className={cn('flex items-center gap-2 text-sm text-destructive', className)}>
      <AlertCircleIcon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" variant="ghost" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

/** Shown while the browser reports no network (online-first PWA, ADR-013). */
export function OfflineBanner({
  label = 'You are offline. Changes can’t be saved until the connection returns.',
}: {
  label?: string;
}) {
  const online = React.useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 bg-warning px-4 py-2 text-center text-sm font-medium text-warning-foreground"
    >
      <WifiOffIcon className="size-4 shrink-0" />
      {label}
    </div>
  );
}
