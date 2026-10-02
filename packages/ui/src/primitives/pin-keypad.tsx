import { cn } from '@rbp/utils';
import { KeyGrid, type KeypadKey, PIN_KEYS } from '../pos/key-grid';

export interface PinKeypadProps {
  value: string;
  onChange: (value: string) => void;
  /** Called once when the value reaches `length`. */
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  error?: boolean;
  clearLabel?: string;
  backspaceLabel?: string;
  className?: string;
}

/** Touch-first PIN pad (POS-006 / AUTH-004). Also accepts physical keyboard digits. */
export function PinKeypad({
  value,
  onChange,
  onComplete,
  length = 4,
  disabled,
  error,
  clearLabel,
  backspaceLabel,
  className,
}: PinKeypadProps) {
  const press = (key: KeypadKey) => {
    if (key === 'clear') return onChange('');
    if (key === 'back') return onChange(value.slice(0, -1));
    if (value.length >= length || !/^\d$/.test(key)) return;
    const next = value + key;
    onChange(next);
    if (next.length === length) onComplete?.(next);
  };

  return (
    <div className={cn('mx-auto flex w-full max-w-xs flex-col gap-5', className)}>
      <div
        className={cn('flex justify-center gap-3', error && 'animate-[shake_0.3s]')}
        aria-live="polite"
      >
        {Array.from({ length }, (_, i) => (
          <span
            key={i}
            className={cn(
              'size-4 rounded-full border-2 transition-colors',
              i < value.length ? 'border-primary bg-primary' : 'border-input',
              error && 'border-destructive bg-destructive/80',
            )}
          />
        ))}
        <span className="sr-only">{`${value.length} of ${length} digits entered`}</span>
      </div>
      <KeyGrid
        keys={PIN_KEYS}
        onKey={press}
        disabled={disabled}
        clearLabel={clearLabel}
        backspaceLabel={backspaceLabel}
      />
    </div>
  );
}
