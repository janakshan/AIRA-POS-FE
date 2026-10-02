import type * as React from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export { toast } from 'sonner';

export function Toaster({ theme = 'system', ...props }: ToasterProps) {
  return (
    <Sonner
      theme={theme}
      richColors
      closeButton
      toastOptions={{
        // Touch: extend the small close button's hit area to 44×44.
        classNames: {
          closeButton:
            'pointer-coarse:after:absolute pointer-coarse:after:-inset-3 pointer-coarse:after:content-[""]',
        },
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
