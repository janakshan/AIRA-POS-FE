import { MinusIcon, PlusIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@rbp/utils';

export interface NumberInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type' | 'size'
> {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Show −/+ stepper buttons. */
  stepper?: boolean;
  decrementLabel?: string;
  incrementLabel?: string;
}

/** Clamp to bounds; integers only (quantities, counts). */
export function clampInteger(value: number, min = -Infinity, max = Infinity): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Integer input with optional stepper. Typing is free; the value is clamped on blur. */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  stepper = true,
  decrementLabel = 'Decrease',
  incrementLabel = 'Increase',
  className,
  disabled,
  onBlur,
  ...props
}: NumberInputProps) {
  const [draft, setDraft] = React.useState(value === null ? '' : String(value));
  // Sync when the value changes from outside (form reset, stepper) — adjusting state during render.
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (draft === '' ? value !== null : Number(draft) !== value) {
      setDraft(value === null ? '' : String(value));
    }
  }

  const commit = (next: number | null) => {
    const clamped = next === null ? null : clampInteger(next, min, max);
    setDraft(clamped === null ? '' : String(clamped));
    onChange(clamped);
  };

  const bump = (delta: number) => commit((value ?? min ?? 0) + delta);
  const atMin = min !== undefined && value !== null && value <= min;
  const atMax = max !== undefined && value !== null && value >= max;

  const stepButton =
    'touch-safe flex w-10 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 focus-ring';

  return (
    <div
      data-slot="number-input"
      className={cn(
        'flex h-10 w-full items-stretch overflow-hidden rounded-md border border-input bg-card shadow-xs focus-within:border-ring has-[input[aria-invalid=true]]:border-destructive pointer-coarse:h-11',
        disabled && 'opacity-50',
        className,
      )}
    >
      {stepper && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={decrementLabel}
          className={cn(stepButton, 'border-r')}
          disabled={disabled || atMin}
          onClick={() => bump(-step)}
        >
          <MinusIcon className="size-4" />
        </button>
      )}
      <input
        type="text"
        inputMode="numeric"
        pattern="-?[0-9]*"
        disabled={disabled}
        value={draft}
        onChange={(e) => {
          const text = e.target.value;
          if (!/^-?\d*$/.test(text)) return;
          setDraft(text);
          if (text !== '' && text !== '-') onChange(Number(text));
        }}
        onBlur={(e) => {
          commit(draft === '' || draft === '-' ? null : Number(draft));
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            bump(step);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            bump(-step);
          }
        }}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        role="spinbutton"
        className="min-w-0 flex-1 bg-transparent px-3 text-center text-base tabular outline-none md:text-sm"
        {...props}
      />
      {stepper && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={incrementLabel}
          className={cn(stepButton, 'border-l')}
          disabled={disabled || atMax}
          onClick={() => bump(step)}
        >
          <PlusIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
