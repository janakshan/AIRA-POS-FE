import { DeleteIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@rbp/utils';

export type KeypadKey =
  '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | '.' | 'clear' | 'back';

export interface KeyGridProps {
  keys: KeypadKey[];
  onKey: (key: KeypadKey) => void;
  disabled?: boolean;
  clearLabel?: string;
  backspaceLabel?: string;
  /** Listen to physical keyboard digits/Backspace/Escape while mounted. */
  captureKeyboard?: boolean;
  className?: string;
}

const OPEN_LAYER = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

/**
 * Only the keypad in the top-most open dialog (or, with none open, the page) may take keyboard
 * input — otherwise a PIN typed on a stacked dialog also lands in the amount keypad below it.
 */
function isTopLayer(el: HTMLElement | null): boolean {
  if (!el) return false;
  const layers = document.querySelectorAll<HTMLElement>(OPEN_LAYER);
  const top = layers[layers.length - 1];
  return top ? top.contains(el) : true;
}

/**
 * 3-column touch key grid shared by PIN, quantity and amount keypads. Keys are ≥64px (80px on sm+
 * when the screen is tall enough — at 1024×768 an 80px pad pushes the last row under the payment
 * dialog's footer).
 */
export function KeyGrid({
  keys,
  onKey,
  disabled,
  clearLabel = 'Clear',
  backspaceLabel = 'Backspace',
  captureKeyboard = true,
  className,
}: KeyGridProps) {
  const emit = React.useEffectEvent((key: KeypadKey) => onKey(key));
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!captureKeyboard || disabled) return;
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable]')) return;
      if (!isTopLayer(ref.current)) return;
      let key: KeypadKey | undefined;
      if (/^\d$/.test(e.key)) key = e.key as KeypadKey;
      else if (e.key === '.' && keys.includes('.')) key = '.';
      else if (e.key === 'Backspace') key = 'back';
      else if (e.key === 'Escape' && keys.includes('clear')) key = 'clear';
      if (key) {
        e.preventDefault();
        emit(key);
      }
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [captureKeyboard, disabled, keys]);

  return (
    <div ref={ref} className={cn('grid grid-cols-3 gap-2 sm:gap-3', className)}>
      {keys.map((key) => {
        const special = key === 'clear' || key === 'back';
        return (
          <button
            key={key}
            type="button"
            data-touch="pos"
            disabled={disabled}
            onClick={() => onKey(key)}
            aria-label={key === 'back' ? backspaceLabel : key === 'clear' ? clearLabel : key}
            className={cn(
              'flex h-16 items-center justify-center rounded-xl border bg-card text-2xl font-semibold tabular shadow-xs focus-ring transition active:scale-95 active:bg-accent disabled:opacity-50 sm:[@media(min-height:50rem)]:h-touch-pos-lg',
              special && 'text-base font-medium text-muted-foreground',
            )}
          >
            {key === 'back' ? (
              <DeleteIcon className="size-6" />
            ) : key === 'clear' ? (
              clearLabel
            ) : (
              key
            )}
          </button>
        );
      })}
    </div>
  );
}

export const PIN_KEYS: KeypadKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'clear',
  '0',
  'back',
];
export const INTEGER_KEYS: KeypadKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '00',
  '0',
  'back',
];
export const DECIMAL_KEYS: KeypadKey[] = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  '0',
  'back',
];
