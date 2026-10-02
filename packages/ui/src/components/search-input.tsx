import { SearchIcon, XIcon } from 'lucide-react';
import * as React from 'react';
import { cn } from '@rbp/utils';

export interface SearchInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'type'
> {
  value: string;
  onValueChange: (value: string) => void;
  /** Fires after the user pauses typing. */
  onSearch?: (value: string) => void;
  debounceMs?: number;
  clearLabel?: string;
}

export function SearchInput({
  value,
  onValueChange,
  onSearch,
  debounceMs = 250,
  clearLabel = 'Clear search',
  className,
  ...props
}: SearchInputProps) {
  const fireSearch = React.useEffectEvent((v: string) => onSearch?.(v));
  const hasSearch = !!onSearch;
  React.useEffect(() => {
    if (!hasSearch) return;
    const id = window.setTimeout(() => fireSearch(value), debounceMs);
    return () => window.clearTimeout(id);
  }, [value, debounceMs, hasSearch]);

  return (
    <div data-slot="search-input" className={cn('relative w-full', className)}>
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onValueChange('');
          }
        }}
        className="h-10 touch-safe w-full rounded-md border border-input bg-card pr-10 pl-9 text-base shadow-xs focus-ring placeholder:text-muted-foreground md:text-sm [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onValueChange('')}
          className="absolute top-1/2 right-0.5 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground focus-ring hover:text-foreground pointer-coarse:size-11"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
