import type { CurrencyCode, Money } from '@rbp/types';
import { cn, parseMoney } from '@rbp/utils';
import * as React from 'react';

export interface MoneyInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type'
> {
  value: Money | null;
  onChange: (value: Money | null) => void;
  currency: CurrencyCode;
  /** Prefix shown inside the field, e.g. "Rs." */
  symbol?: string;
}

/** Minor units → plain decimal string for editing, e.g. 125050 → "1250.50". Integer math only. */
export function toDecimalString(value: Money | null): string {
  if (!value) return '';
  const negative = value.amount < 0;
  const abs = Math.abs(value.amount);
  const whole = Math.floor(abs / 100);
  const cents = String(abs % 100).padStart(2, '0');
  return `${negative ? '-' : ''}${whole}.${cents}`;
}

/**
 * Money entry. The user types a decimal string; it is parsed to integer minor units with
 * `parseMoney` — never through floating point.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  symbol,
  className,
  onBlur,
  ...props
}: MoneyInputProps) {
  const [draft, setDraft] = React.useState(() => toDecimalString(value));
  // Value we last emitted; an external change (form reset) differs from it and resets the draft
  // without clobbering what the user is typing.
  const [lastEmitted, setLastEmitted] = React.useState<Money | null>(value);
  if (value?.amount !== lastEmitted?.amount) {
    setLastEmitted(value);
    setDraft(toDecimalString(value));
  }

  const emit = (next: Money | null) => {
    setLastEmitted(next);
    onChange(next);
  };

  return (
    <div
      data-slot="money-input"
      className={cn(
        'flex h-10 w-full items-center overflow-hidden rounded-md border border-input bg-card shadow-xs focus-within:border-ring has-[input[aria-invalid=true]]:border-destructive pointer-coarse:h-11',
        className,
      )}
    >
      {symbol && (
        <span className="flex items-center self-stretch border-r bg-muted px-3 text-sm text-muted-foreground">
          {symbol}
        </span>
      )}
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={draft}
        onChange={(e) => {
          const text = e.target.value;
          if (!/^\d*(\.\d{0,2})?$/.test(text.replace(/,/g, ''))) return;
          setDraft(text);
          try {
            emit(text.trim() === '' ? null : parseMoney(text, currency));
          } catch {
            /* partial input such as "." — keep draft, emit nothing */
          }
        }}
        onBlur={(e) => {
          if (value) setDraft(toDecimalString(value));
          onBlur?.(e);
        }}
        className="min-w-0 flex-1 bg-transparent px-3 text-right text-base tabular outline-none md:text-sm"
        {...props}
      />
    </div>
  );
}
