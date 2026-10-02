import type * as React from 'react';
import { cn } from '@rbp/utils';
import { TONE_ICONS, type StatusTone, toneClasses } from './status-badge';

export interface AlertProps extends Omit<React.ComponentProps<'div'>, 'title'> {
  tone?: Exclude<StatusTone, 'progress'>;
  title?: React.ReactNode;
  action?: React.ReactNode;
}

/** Inline banner for page/section-level messages. Danger/warning are announced to screen readers. */
export function Alert({ tone = 'info', title, action, className, children, ...props }: AlertProps) {
  const Icon = TONE_ICONS[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      data-tone={tone}
      className={cn(
        'flex flex-col gap-3 rounded-lg p-3.5 ring-1 ring-inset sm:flex-row sm:items-start',
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 space-y-0.5">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className="text-foreground/85">{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0 sm:self-center">{action}</div>}
    </div>
  );
}
