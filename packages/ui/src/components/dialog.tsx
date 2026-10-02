import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@rbp/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export const dialogSizes: Record<DialogSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
  full: 'sm:max-w-[calc(100vw-4rem)] sm:h-[calc(100dvh-4rem)]',
};

export const overlayClasses =
  'fixed inset-0 z-overlay bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0';

export const closeButtonClasses =
  'focus-ring absolute top-3 right-3 flex size-9 items-center justify-center rounded-md opacity-70 transition-opacity hover:bg-accent hover:opacity-100 pointer-coarse:size-11 [&_svg]:size-4';

export function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay className={cn(overlayClasses, className)} {...props} />;
}

export function DialogContent({
  className,
  children,
  size = 'md',
  showCloseButton = true,
  closeLabel = 'Close',
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  size?: DialogSize;
  showCloseButton?: boolean;
  closeLabel?: string;
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-overlay grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg duration-(--duration-normal) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-6',
          dialogSizes[size],
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close className={closeButtonClasses}>
            <XIcon />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-8 text-left', className)} {...props} />;
}

/** Buttons stack full-width on mobile (primary on top), inline and right-aligned from sm. */
export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto',
        className,
      )}
      {...props}
    />
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-heading', className)} {...props} />;
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description className={cn('text-muted-foreground', className)} {...props} />
  );
}
