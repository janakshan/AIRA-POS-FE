import type { Money } from '@rbp/types';
import { cn, formatMoney } from '@rbp/utils';
import * as React from 'react';

export interface ProductTileProps extends Omit<React.ComponentProps<'button'>, 'children'> {
  name: string;
  price: Money;
  locale?: string;
  /** Category/product colour configured by the admin (any CSS colour). */
  color?: string;
  /** Short code shown in the corner (PLU / Quick Pad key). */
  code?: string;
  /** e.g. "3 left". Shown as a warning chip. */
  stockNote?: string;
  unavailable?: boolean;
  unavailableLabel?: string;
  /** Items already in the cart — shown as a count badge and a selected outline. */
  quantityInCart?: number;
  /** Button image (REQ-144). Decorative: the name is always shown as text. */
  imageUrl?: string | null;
  /** Long-press (≥500ms) or the ContextMenu / Shift+F10 key opens options/modifiers. */
  onLongPress?: () => void;
}

const LONG_PRESS_MS = 500;
/** Pointer travel (px) that turns a press into a scroll and cancels the long-press. */
const MOVE_TOLERANCE = 10;

/** Quick Pad product button (POS-001). ≥80px tall, name clamps to 2 lines, price always visible. */
export function ProductTile({
  name,
  price,
  locale,
  color,
  code,
  stockNote,
  unavailable,
  unavailableLabel = 'Unavailable',
  quantityInCart,
  imageUrl,
  onLongPress,
  className,
  disabled,
  onClick,
  onKeyDown,
  ...props
}: ProductTileProps) {
  const timer = React.useRef<number | undefined>(undefined);
  const origin = React.useRef<{ x: number; y: number } | null>(null);
  const longPressed = React.useRef(false);
  const [pressing, setPressing] = React.useState(false);

  const cancel = () => {
    window.clearTimeout(timer.current);
    origin.current = null;
    setPressing(false);
  };
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const start = (e: React.PointerEvent) => {
    longPressed.current = false;
    if (!onLongPress) return;
    origin.current = { x: e.clientX, y: e.clientY };
    setPressing(true);
    timer.current = window.setTimeout(() => {
      longPressed.current = true;
      setPressing(false);
      onLongPress();
    }, LONG_PRESS_MS);
  };
  const move = (e: React.PointerEvent) => {
    if (!origin.current) return;
    if (
      Math.abs(e.clientX - origin.current.x) > MOVE_TOLERANCE ||
      Math.abs(e.clientY - origin.current.y) > MOVE_TOLERANCE
    ) {
      cancel();
    }
  };

  const inCart = !!quantityInCart && quantityInCart > 0;
  const accent = color ?? 'var(--primary)';

  return (
    <button
      type="button"
      data-slot="product-tile"
      data-touch="pos"
      data-in-cart={inCart || undefined}
      data-pressing={pressing || undefined}
      disabled={disabled || unavailable}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={onLongPress ? (e) => e.preventDefault() : undefined}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!onLongPress || e.defaultPrevented) return;
        if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
          e.preventDefault();
          onLongPress();
        }
      }}
      onClick={(e) => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onClick?.(e);
      }}
      className={cn(
        'group relative flex min-h-26 flex-col justify-between gap-2 overflow-hidden rounded-xl border bg-card p-3 pt-4 text-left shadow-xs focus-ring transition select-none',
        'hover:border-foreground/20 active:scale-[0.97] data-pressing:scale-[0.98] data-pressing:brightness-95',
        'disabled:cursor-not-allowed disabled:opacity-50',
        inCart && 'border-primary bg-primary/5 ring-1 ring-primary/30',
        className,
      )}
      {...props}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <span className={cn('flex items-start gap-2', inCart && 'pr-10')}>
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            aria-hidden
            className="size-11 shrink-0 rounded-lg object-cover"
            draggable={false}
          />
        )}
        <span className="line-clamp-2 text-pos-tile">{name}</span>
      </span>
      <span className="flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
        <span className="text-base font-bold text-foreground tabular group-disabled:line-through">
          {formatMoney(price, locale)}
        </span>
        {unavailable ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium">
            {unavailableLabel}
          </span>
        ) : stockNote ? (
          <span className="rounded bg-status-warning/15 px-1.5 py-0.5 text-[11px] font-medium text-status-warning-fg">
            {stockNote}
          </span>
        ) : code ? (
          <span className="font-mono text-[11px] text-muted-foreground">{code}</span>
        ) : null}
      </span>
      {inCart && (
        <span className="absolute top-3 right-2.5 flex h-6 min-w-8 items-center justify-center rounded-full bg-primary px-2 text-xs font-bold text-primary-foreground tabular">
          ×{quantityInCart}
        </span>
      )}
    </button>
  );
}
