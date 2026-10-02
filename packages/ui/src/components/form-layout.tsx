import type * as React from 'react';
import { cn } from '@rbp/utils';

/** Groups related fields. Title/description sit beside the fields on desktop, above on mobile. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'grid gap-stack border-b pb-section last:border-b-0 last:pb-0 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] lg:gap-8',
        className,
      )}
    >
      <div className="space-y-1">
        <h2 className="text-heading">{title}</h2>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      <div className="grid gap-stack sm:grid-cols-2 [&>[data-span=full]]:sm:col-span-2">
        {children}
      </div>
    </section>
  );
}

/**
 * Form buttons. On mobile they stick to the bottom of the viewport as full-width buttons
 * so the primary action is always reachable with a thumb.
 */
export function FormActions({
  children,
  className,
  sticky = true,
}: {
  children: React.ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <div
      data-slot="form-actions"
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto',
        sticky &&
          'max-sm:sticky max-sm:bottom-0 max-sm:z-sticky max-sm:-mx-page max-sm:border-t max-sm:bg-background/95 max-sm:px-page max-sm:py-3 max-sm:backdrop-blur',
        className,
      )}
    >
      {children}
    </div>
  );
}
