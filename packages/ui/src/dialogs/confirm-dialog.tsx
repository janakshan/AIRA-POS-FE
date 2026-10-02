import { AlertTriangleIcon } from 'lucide-react';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@rbp/utils';
import { Button } from '../components/button';
import { overlayClasses } from '../components/dialog';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  onConfirm: () => void;
  /** Red confirm button + warning icon for irreversible actions (void, delete, refund). */
  destructive?: boolean;
  /** Keeps the dialog open with a busy confirm button while the action runs. */
  loading?: boolean;
  children?: React.ReactNode;
}

/** Alert dialog: focus starts on Cancel and outside clicks don't dismiss it. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  destructive,
  loading,
  children,
}: ConfirmDialogProps) {
  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className={overlayClasses} />
        <AlertDialogPrimitive.Content
          data-slot="confirm-dialog"
          className="fixed top-1/2 left-1/2 z-overlay grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl border bg-popover p-5 text-popover-foreground shadow-lg duration-(--duration-normal) data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:p-6"
        >
          <div className="flex gap-4">
            {destructive && (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangleIcon className="size-5" />
              </span>
            )}
            <div className="min-w-0 space-y-1.5">
              <AlertDialogPrimitive.Title className="text-heading">
                {title}
              </AlertDialogPrimitive.Title>
              <AlertDialogPrimitive.Description
                className={cn('text-muted-foreground', !description && 'sr-only')}
              >
                {description ?? title}
              </AlertDialogPrimitive.Description>
            </div>
          </div>
          {children}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end [&>*]:w-full sm:[&>*]:w-auto">
            <AlertDialogPrimitive.Cancel asChild>
              <Button variant="outline" size="lg" className="sm:h-10 sm:text-sm" disabled={loading}>
                {cancelLabel}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              size="lg"
              className="sm:h-10 sm:text-sm"
              loading={loading}
              onClick={onConfirm}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
