import { cva } from 'class-variance-authority';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  InfoIcon,
  LoaderIcon,
  type LucideIcon,
  XCircleIcon,
} from 'lucide-react';
import type * as React from 'react';
import { cn } from '@rbp/utils';

export type StatusTone = 'neutral' | 'info' | 'warning' | 'progress' | 'success' | 'danger';

/** Canonical status → tone mapping so every module colours statuses the same way. */
export const STATUS_TONES: Record<string, StatusTone> = {
  DRAFT: 'neutral',
  OPEN: 'info',
  PENDING: 'warning',
  HELD: 'warning',
  IN_PROGRESS: 'progress',
  PREPARING: 'progress',
  READY: 'info',
  SERVED: 'success',
  COMPLETED: 'success',
  PAID: 'success',
  ACTIVE: 'success',
  LOW_STOCK: 'warning',
  OUT_OF_STOCK: 'danger',
  CANCELLED: 'danger',
  VOIDED: 'danger',
  REFUNDED: 'neutral',
  INACTIVE: 'neutral',
};

/** Each tone has an icon so status is never conveyed by colour alone. */
export const TONE_ICONS: Record<StatusTone, LucideIcon> = {
  neutral: CircleDashedIcon,
  info: InfoIcon,
  warning: AlertTriangleIcon,
  progress: LoaderIcon,
  success: CheckCircle2Icon,
  danger: XCircleIcon,
};

export const toneClasses: Record<StatusTone, string> = {
  neutral: 'bg-status-neutral/12 text-status-neutral-fg ring-status-neutral/30',
  info: 'bg-status-info/12 text-status-info-fg ring-status-info/30',
  warning: 'bg-status-warning/15 text-status-warning-fg ring-status-warning/35',
  progress: 'bg-status-progress/12 text-status-progress-fg ring-status-progress/30',
  success: 'bg-status-success/12 text-status-success-fg ring-status-success/30',
  danger: 'bg-status-danger/12 text-status-danger-fg ring-status-danger/30',
};

const dotClasses: Record<StatusTone, string> = {
  neutral: 'bg-status-neutral',
  info: 'bg-status-info',
  warning: 'bg-status-warning',
  progress: 'bg-status-progress',
  success: 'bg-status-success',
  danger: 'bg-status-danger',
};

const badgeSize = cva(
  'inline-flex items-center rounded-full font-medium whitespace-nowrap ring-1 ring-inset',
  {
    variants: {
      size: {
        sm: 'gap-1 px-2 py-0.5 text-[11px] leading-4 [&_svg]:size-3',
        md: 'gap-1.5 px-2.5 py-0.5 text-caption [&_svg]:size-3.5',
        /** KOT cards, kitchen board, POS order status. */
        lg: 'gap-2 px-3.5 py-1.5 text-body font-semibold [&_svg]:size-4',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export function resolveTone(status?: string, tone?: StatusTone): StatusTone {
  return tone ?? (status ? STATUS_TONES[status] : undefined) ?? 'neutral';
}

export function humanizeStatus(status: string): string {
  return status
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export interface StatusBadgeProps extends React.ComponentProps<'span'> {
  /** Business status code, e.g. "IN_PROGRESS". Used for tone lookup when `tone` is not set. */
  status?: string;
  tone?: StatusTone;
  size?: 'sm' | 'md' | 'lg';
  /** Hide the tone icon (keep it unless space is critical — it's the non-colour cue). */
  hideIcon?: boolean;
}

export function StatusBadge({
  status,
  tone,
  size,
  hideIcon,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  const resolved = resolveTone(status, tone);
  const Icon = TONE_ICONS[resolved];
  return (
    <span
      data-status={status}
      data-tone={resolved}
      className={cn(badgeSize({ size }), toneClasses[resolved], className)}
      {...props}
    >
      {!hideIcon && <Icon aria-hidden />}
      {children ?? (status ? humanizeStatus(status) : null)}
    </span>
  );
}

/** Compact status marker for dense lists; always pair with a text label. */
export function StatusDot({
  status,
  tone,
  pulse,
  className,
}: {
  status?: string;
  tone?: StatusTone;
  pulse?: boolean;
  className?: string;
}) {
  const resolved = resolveTone(status, tone);
  return (
    <span aria-hidden className={cn('relative inline-flex size-2.5 shrink-0', className)}>
      {pulse && (
        <span
          className={cn(
            'absolute inset-0 animate-ping rounded-full opacity-60',
            dotClasses[resolved],
          )}
        />
      )}
      <span className={cn('relative inline-flex size-full rounded-full', dotClasses[resolved])} />
    </span>
  );
}
