import { ChevronRightIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '@rbp/utils';

export interface BreadcrumbItem {
  label: React.ReactNode;
  /** Rendered through `renderLink` when present; the last item is always the current page. */
  href?: string;
}

export function Breadcrumbs({
  items,
  renderLink,
  label = 'Breadcrumb',
  className,
}: {
  items: BreadcrumbItem[];
  /** Router-agnostic link renderer, e.g. (href, children) => <Link to={href}>{children}</Link>. */
  renderLink?: (href: string, children: React.ReactNode) => React.ReactNode;
  label?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label={label} className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1 text-caption text-muted-foreground">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className={cn('flex min-w-0 items-center gap-1', !last && 'shrink-0')}>
              {item.href && !last && renderLink ? (
                <span className="hover:text-foreground">{renderLink(item.href, item.label)}</span>
              ) : (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn('truncate', last && 'text-foreground/80')}
                >
                  {item.label}
                </span>
              )}
              {!last && <ChevronRightIcon aria-hidden className="size-3 shrink-0" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
