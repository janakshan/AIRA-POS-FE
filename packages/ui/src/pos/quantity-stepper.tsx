import { MinusIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { cn } from '@rbp/utils';

export interface QuantityStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** At `min`, the minus button becomes remove (calls onRemove). */
  onRemove?: () => void;
  size?: 'md' | 'pos';
  decrementLabel?: string;
  incrementLabel?: string;
  removeLabel?: string;
  /** Group label, e.g. the item name. */
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** Large −/qty/+ control. POS size is 56px so it can be hit reliably on a busy counter. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 999,
  onRemove,
  size = 'pos',
  decrementLabel = 'Decrease quantity',
  incrementLabel = 'Increase quantity',
  removeLabel = 'Remove item',
  label = 'Quantity',
  disabled,
  className,
}: QuantityStepperProps) {
  const atMin = value <= min;
  const showRemove = atMin && !!onRemove;
  const btn = cn(
    'flex shrink-0 items-center justify-center rounded-lg border bg-card focus-ring transition active:scale-95 active:bg-accent disabled:opacity-40',
    size === 'pos' ? 'size-touch-pos [&_svg]:size-6' : 'size-11 [&_svg]:size-4',
  );
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      <button
        type="button"
        data-touch={size === 'pos' ? 'pos' : undefined}
        className={cn(btn, showRemove && 'text-destructive')}
        aria-label={showRemove ? removeLabel : decrementLabel}
        disabled={disabled || (atMin && !onRemove)}
        onClick={() => (showRemove ? onRemove() : onChange(value - 1))}
      >
        {showRemove ? <Trash2Icon /> : <MinusIcon />}
      </button>
      <output
        aria-live="polite"
        className={cn(
          'min-w-10 text-center font-semibold tabular',
          size === 'pos' ? 'text-xl' : 'text-base',
        )}
      >
        {value}
      </output>
      <button
        type="button"
        data-touch={size === 'pos' ? 'pos' : undefined}
        className={btn}
        aria-label={incrementLabel}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
      >
        <PlusIcon />
      </button>
    </div>
  );
}
