import { XIcon } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@rbp/utils';
import {
  closeButtonClasses,
  type DialogSize,
  dialogSizes,
  overlayClasses,
} from '../components/dialog';
import { useIsMobile } from '../hooks/use-media-query';

export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Footer actions. Stacked full-width on mobile, right-aligned inline on larger screens. */
  footer?: React.ReactNode;
  size?: DialogSize;
  closeLabel?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Centered dialog from 768px up; a bottom sheet on phones so actions stay within thumb reach.
 * Use this instead of Dialog for anything that can appear on mobile.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size = 'md',
  closeLabel = 'Close',
  children,
  className,
}: ResponsiveDialogProps) {
  const mobile = useIsMobile();
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClasses} />
        <DialogPrimitive.Content
          data-slot="responsive-dialog"
          data-layout={mobile ? 'sheet' : 'dialog'}
          className={cn(
            'fixed z-overlay flex flex-col bg-popover text-popover-foreground shadow-lg duration-(--duration-normal) data-[state=closed]:animate-out data-[state=open]:animate-in',
            mobile
              ? 'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl border-t pb-[env(safe-area-inset-bottom)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom'
              : cn(
                  'top-1/2 left-1/2 max-h-[calc(100dvh-4rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                  dialogSizes[size],
                ),
            className,
          )}
        >
          {mobile && (
            <div
              aria-hidden
              className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-border"
            />
          )}
          <div className="flex flex-col gap-1.5 px-5 pt-4 pr-14 sm:px-6 sm:pt-6">
            <DialogPrimitive.Title className="text-heading">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
          {footer && (
            <div className="flex flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end sm:border-t-0 sm:px-6 sm:pt-0 sm:pb-6 [&>*]:w-full sm:[&>*]:w-auto">
              {footer}
            </div>
          )}
          <DialogPrimitive.Close className={closeButtonClasses}>
            <XIcon />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
