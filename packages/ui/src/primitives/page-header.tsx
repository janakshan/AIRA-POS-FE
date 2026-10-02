import { EllipsisVerticalIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@rbp/utils';
import { Button } from '../components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/dropdown-menu';

export interface PageAction {
  id: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Breadcrumbs or a small context line above the title. */
  eyebrow?: React.ReactNode;
  /** Always-visible actions (keep to one primary + one secondary). */
  actions?: React.ReactNode;
  /** Extra actions: inline buttons from 640px, collapsed into a ⋮ menu on phones. */
  secondaryActions?: PageAction[];
  moreLabel?: string;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  secondaryActions,
  eyebrow,
  moreLabel = 'More actions',
  className,
}: PageHeaderProps) {
  const hasSecondary = !!secondaryActions?.length;
  return (
    <div
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between', className)}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow &&
          (typeof eyebrow === 'string' ? (
            <p className="text-overline text-muted-foreground uppercase">{eyebrow}</p>
          ) : (
            eyebrow
          ))}
        <h1 className="text-title">{title}</h1>
        {description && <p className="text-muted-foreground">{description}</p>}
      </div>
      {(actions || hasSecondary) && (
        <div className="flex shrink-0 items-center gap-2 max-sm:[&>[data-slot=button]]:flex-1">
          {hasSecondary && (
            <div className="hidden items-center gap-2 sm:flex">
              {secondaryActions?.map((a) => (
                <Button
                  key={a.id}
                  variant="outline"
                  onClick={a.onSelect}
                  disabled={a.disabled}
                  className={cn(a.destructive && 'text-destructive')}
                >
                  {a.icon}
                  {a.label}
                </Button>
              ))}
            </div>
          )}
          {actions}
          {hasSecondary && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label={moreLabel} className="sm:hidden">
                  <EllipsisVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {secondaryActions?.map((a) => (
                  <DropdownMenuItem
                    key={a.id}
                    onSelect={a.onSelect}
                    disabled={a.disabled}
                    variant={a.destructive ? 'destructive' : 'default'}
                  >
                    {a.icon}
                    {a.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
}
