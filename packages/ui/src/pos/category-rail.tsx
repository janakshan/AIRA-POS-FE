import { cn } from '@rbp/utils';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import * as React from 'react';

export interface CategoryOption {
  id: string;
  label: string;
  color?: string;
  count?: number;
  /** Has subcategories: selecting it drills in (shown with a chevron). */
  hasChildren?: boolean;
  /** Replaces the colour dot with a small thumbnail. */
  imageUrl?: string | null;
}

export interface CategoryRailProps {
  categories: CategoryOption[];
  value: string;
  onChange: (id: string) => void;
  label: string;
  /** vertical from tablet up (side rail); always horizontal chips on phones. */
  orientation?: 'responsive' | 'horizontal';
  /** id of the tabpanel (product grid) the tabs control. */
  panelId?: string;
  /** Drilled into a subcategory level: a leading button returns to the parent level. */
  back?: { label: string; onBack: () => void };
  className?: string;
}

/** Category picker for the Quick Pad: horizontal scroll on phones, vertical rail on tablets+. */
export function CategoryRail({
  categories,
  value,
  onChange,
  label,
  orientation = 'responsive',
  panelId,
  back,
  className,
}: CategoryRailProps) {
  const vertical = orientation === 'responsive';
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const focusAt = (index: number) => {
    const n = categories.length;
    if (!n) return;
    const i = (index + n) % n;
    const c = categories[i];
    if (!c) return;
    onChange(c.id);
    refs.current[i]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    // Accept both axes: the responsive rail flips orientation by breakpoint.
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        focusAt(index + 1);
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        focusAt(index - 1);
        break;
      case 'Home':
        focusAt(0);
        break;
      case 'End':
        focusAt(categories.length - 1);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const layout = cn('flex gap-2', vertical && 'md:flex-col');
  return (
    <div
      className={cn(
        'scrollbar-none overflow-x-auto',
        layout,
        vertical && 'md:overflow-x-visible md:overflow-y-auto',
        className,
      )}
    >
      {back && (
        <button
          type="button"
          data-touch="pos"
          onClick={back.onBack}
          className={cn(
            'flex h-touch-pos shrink-0 items-center gap-2 rounded-xl border border-dashed px-3 text-sm font-semibold text-muted-foreground focus-ring transition hover:bg-accent hover:text-foreground active:scale-[0.97]',
            vertical && 'md:w-full',
          )}
        >
          <ChevronLeftIcon className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{back.label}</span>
        </button>
      )}
      <div
        role="tablist"
        aria-label={label}
        aria-orientation={vertical ? undefined : 'horizontal'}
        className={layout}
      >
        {categories.map((c, index) => {
          const selected = c.id === value;
          return (
            <button
              key={c.id}
              ref={(el) => {
                refs.current[index] = el;
              }}
              type="button"
              role="tab"
              data-touch="pos"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(c.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              className={cn(
                'flex h-touch-pos shrink-0 items-center gap-3 rounded-xl border px-4 text-sm font-semibold whitespace-nowrap focus-ring transition active:scale-[0.97]',
                vertical && 'md:w-full md:justify-between md:text-left md:whitespace-normal',
                selected
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'bg-card hover:bg-accent',
              )}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt=""
                    aria-hidden
                    className="size-7 shrink-0 rounded-md object-cover"
                    style={{ boxShadow: `0 0 0 2px ${c.color ?? 'transparent'}` }}
                  />
                ) : (
                  <span
                    aria-hidden
                    className={cn(
                      'size-3 shrink-0 rounded-full',
                      selected && 'ring-2 ring-primary-foreground',
                    )}
                    style={{ background: c.color ?? 'currentColor' }}
                  />
                )}
                <span className="truncate">{c.label}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {c.count !== undefined && (
                  <span
                    className={cn(
                      'min-w-7 rounded-full px-2 py-0.5 text-center text-xs font-semibold tabular',
                      selected ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {c.count}
                  </span>
                )}
                {c.hasChildren && (
                  <ChevronRightIcon
                    aria-hidden
                    className={cn('size-4', selected ? 'opacity-80' : 'text-muted-foreground')}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
