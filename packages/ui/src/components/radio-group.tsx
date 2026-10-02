import { CheckCircle2Icon } from 'lucide-react';
import { RadioGroup as RadioGroupPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@rbp/utils';

export function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn('grid gap-3', className)}
      {...props}
    />
  );
}

export function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        'relative aspect-square size-5 shrink-0 rounded-full border border-input bg-card shadow-xs focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-[state=checked]:border-primary',
        'pointer-coarse:after:absolute pointer-coarse:after:-inset-3 pointer-coarse:after:content-[""]',
        className,
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
        <span className="size-2.5 rounded-full bg-primary" />
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}

export interface RadioCardProps extends Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Item>,
  'title'
> {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
}

/** Large, touch-friendly radio option (location selection, payment method, order type). */
export function RadioCard({ className, title, description, icon, ...props }: RadioCardProps) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-card"
      className={cn(
        'group flex min-h-16 w-full items-center gap-3 rounded-xl border bg-card p-3 text-left focus-ring transition-colors hover:bg-accent/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary/30',
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:size-5">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {description && (
          <span className="block truncate text-caption text-muted-foreground">{description}</span>
        )}
      </span>
      <CheckCircle2Icon className="size-5 text-primary opacity-0 transition-opacity group-data-[state=checked]:opacity-100" />
    </RadioGroupPrimitive.Item>
  );
}
