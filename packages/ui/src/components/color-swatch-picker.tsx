import { CheckIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@rbp/utils';
import { Input } from './input';

/** Preset button colours, tuned for white text/badges and legible in both themes. */
export const SWATCH_COLORS = [
  'oklch(0.7 0.15 60)',
  'oklch(0.62 0.17 30)',
  'oklch(0.72 0.14 100)',
  'oklch(0.65 0.15 145)',
  'oklch(0.62 0.12 185)',
  'oklch(0.6 0.13 230)',
  'oklch(0.55 0.15 265)',
  'oklch(0.58 0.16 300)',
  'oklch(0.6 0.12 330)',
  'oklch(0.6 0.18 15)',
  'oklch(0.5 0.03 250)',
  'oklch(0.45 0.08 50)',
] as const;

export interface ColorSwatchPickerProps {
  value: string;
  onChange: (color: string) => void;
  /** Accessible group label. */
  label: string;
  customLabel?: string;
  colors?: readonly string[];
  className?: string;
  id?: string;
  'aria-invalid'?: boolean;
}

/**
 * Swatch radio group (arrow keys move, like any radio group) plus a free CSS colour field
 * for brand colours outside the presets.
 */
export function ColorSwatchPicker({
  value,
  onChange,
  label,
  customLabel = 'Custom colour',
  colors = SWATCH_COLORS,
  className,
  id,
  ...aria
}: ColorSwatchPickerProps) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = colors.indexOf(value);
  const focusIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const customId = React.useId();

  const move = (from: number, delta: number) => {
    const next = (from + delta + colors.length) % colors.length;
    const color = colors[next];
    if (color) onChange(color);
    refs.current[next]?.focus();
  };

  return (
    <div className={cn('space-y-3', className)}>
      <div
        id={id}
        role="radiogroup"
        aria-label={label}
        aria-invalid={aria['aria-invalid']}
        className="flex flex-wrap gap-2"
      >
        {colors.map((color, i) => {
          const selected = color === value;
          return (
            <button
              key={color}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={color}
              tabIndex={i === focusIndex ? 0 : -1}
              onClick={() => onChange(color)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(i, -1);
                }
              }}
              className={cn(
                'flex size-11 items-center justify-center rounded-full border-2 border-transparent text-white shadow-xs focus-ring transition active:scale-95',
                selected && 'border-foreground',
              )}
              style={{ background: color }}
            >
              {selected && <CheckIcon className="size-5" aria-hidden />}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-8 shrink-0 rounded-md border"
          style={{ background: value || 'transparent' }}
        />
        <label htmlFor={customId} className="sr-only">
          {customLabel}
        </label>
        <Input
          id={customId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#ff8800"
          className="max-w-56 font-mono text-sm"
          aria-invalid={aria['aria-invalid']}
        />
      </div>
    </div>
  );
}
