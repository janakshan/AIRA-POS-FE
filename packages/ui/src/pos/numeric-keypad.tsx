import type * as React from 'react';
import { cn } from '@rbp/utils';
import { DECIMAL_KEYS, INTEGER_KEYS, KeyGrid, type KeypadKey } from './key-grid';

export interface NumericKeypadProps {
  /** Raw entry string, e.g. "1250.5". Convert with parseMoney / Number at the call site. */
  value: string;
  onChange: (value: string) => void;
  mode?: 'integer' | 'decimal';
  maxLength?: number;
  /** Decimal places allowed in decimal mode. */
  decimals?: number;
  /** Display above keys, e.g. formatted amount. Defaults to the raw value. */
  display?: React.ReactNode;
  label?: React.ReactNode;
  /** Quick buttons shown beside/below the keys (exact amount, Rs. 1000…). */
  presets?: React.ReactNode;
  disabled?: boolean;
  backspaceLabel?: string;
  className?: string;
}

/** Apply a key press to an entry string with integer/decimal rules. Pure, for testing. */
export function applyKey(
  value: string,
  key: KeypadKey,
  {
    mode = 'integer',
    maxLength = 9,
    decimals = 2,
  }: Pick<NumericKeypadProps, 'mode' | 'maxLength' | 'decimals'> = {},
): string {
  if (key === 'back') return value.slice(0, -1);
  if (key === 'clear') return '';
  if (key === '.') {
    if (mode !== 'decimal' || value.includes('.')) return value;
    return value === '' ? '0.' : `${value}.`;
  }
  const [, fraction] = value.split('.');
  if (fraction !== undefined && fraction.length + key.length > decimals) return value;
  if (value.replace('.', '').length + key.length > maxLength) return value;
  if (value === '0') return key === '00' ? '0' : key;
  if (value === '' && key === '00') return '0';
  return value + key;
}

/** Touch keypad for quantities and amounts (payment tendered, price override, stock count). */
export function NumericKeypad({
  value,
  onChange,
  mode = 'integer',
  maxLength,
  decimals,
  display,
  label,
  presets,
  disabled,
  backspaceLabel,
  className,
}: NumericKeypadProps) {
  return (
    <div className={cn('flex w-full flex-col gap-3', className)}>
      <div className="rounded-xl border bg-muted/40 px-4 py-3 text-right">
        {label && <div className="text-caption text-muted-foreground">{label}</div>}
        <output aria-live="polite" className="block min-h-10 truncate text-pos-total tabular">
          {display ?? (value || '0')}
        </output>
      </div>
      <div className={cn('grid gap-3', presets && 'sm:grid-cols-[1fr_auto]')}>
        <KeyGrid
          keys={mode === 'decimal' ? DECIMAL_KEYS : INTEGER_KEYS}
          onKey={(key) => onChange(applyKey(value, key, { mode, maxLength, decimals }))}
          disabled={disabled}
          backspaceLabel={backspaceLabel}
        />
        {presets && <div className="grid grid-cols-3 gap-2 sm:w-32 sm:grid-cols-1">{presets}</div>}
      </div>
    </div>
  );
}
