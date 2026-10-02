import type { CategoryTreeNode } from '@rbp/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@rbp/ui';
import type * as React from 'react';

const NONE = '__none__';

export interface CategorySelectProps {
  tree: CategoryTreeNode[] | undefined;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder: string;
  /** Adds a first option meaning "no category" (top level / all categories). */
  noneLabel?: string;
  /** Hide this category and its descendants (a category can't be its own parent). */
  excludeSubtreeOf?: string;
  /** Suffix for inactive categories. */
  inactiveLabel: string;
  id?: string;
  className?: string;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
  triggerRef?: React.Ref<HTMLButtonElement>;
}

/** Category picker that shows the tree with indentation (CAT-002, CAT-003, CAT-004). */
export function CategorySelect({
  tree,
  value,
  onChange,
  placeholder,
  noneLabel,
  excludeSubtreeOf,
  inactiveLabel,
  id,
  className,
  triggerRef,
  ...aria
}: CategorySelectProps) {
  const excluded = new Set<string>();
  if (excludeSubtreeOf && tree) {
    excluded.add(excludeSubtreeOf);
    for (const c of tree) if (c.parentId && excluded.has(c.parentId)) excluded.add(c.id);
  }
  return (
    <Select
      value={value ?? (noneLabel ? NONE : '')}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
    >
      <SelectTrigger id={id} ref={triggerRef} className={className} {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {tree
          ?.filter((c) => !excluded.has(c.id))
          .map((c) => (
            <SelectItem key={c.id} value={c.id}>
              <span className="flex items-center gap-2" style={{ paddingLeft: c.depth * 16 }}>
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: c.color }}
                />
                {c.name}
                {!c.isActive && (
                  <span className="text-xs text-muted-foreground">({inactiveLabel})</span>
                )}
              </span>
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
