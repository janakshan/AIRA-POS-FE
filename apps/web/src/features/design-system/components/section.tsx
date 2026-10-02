import { Card } from '@rbp/ui';
import { cn } from '@rbp/utils';
import type { ReactNode } from 'react';

export function DsSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-32 space-y-stack">
      <h2 id={`${id}-title`} className="text-title">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Example({
  title,
  hint,
  children,
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className="gap-4 px-4 sm:px-5">
      <div className="space-y-1">
        <h3 className="text-heading">{title}</h3>
        {hint && <p className="text-muted-foreground">{hint}</p>}
      </div>
      <div className={cn('min-w-0', className)}>{children}</div>
    </Card>
  );
}
