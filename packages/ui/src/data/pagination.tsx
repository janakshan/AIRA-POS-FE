import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { cn } from '@rbp/utils';
import { Button } from '../components/button';

export interface PaginationProps {
  /** 1-based page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  /** e.g. (from, to, total) => `${from}–${to} of ${total}` */
  summary?: (from: number, to: number, total: number) => string;
  previousLabel?: string;
  nextLabel?: string;
  pageLabel?: (page: number) => string;
  className?: string;
}

/** Page numbers with gaps: 1 … 4 5 6 … 12 */
export function pageWindow(page: number, pages: number): (number | 'gap')[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const set = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  summary = (from, to, t) => `${from}–${to} of ${t}`,
  previousLabel = 'Previous page',
  nextLabel = 'Next page',
  pageLabel = (p) => `Page ${p}`,
  className,
}: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      aria-label="Pagination"
      className={cn('flex items-center justify-between gap-3 text-sm', className)}
    >
      <p className="text-muted-foreground tabular" aria-live="polite">
        {summary(from, to, total)}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label={previousLabel}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <div className="hidden items-center gap-1 sm:flex">
          {pageWindow(page, pages).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? 'default' : 'ghost'}
                size="icon"
                aria-label={pageLabel(p)}
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPageChange(p)}
                className="tabular"
              >
                {p}
              </Button>
            ),
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label={nextLabel}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </nav>
  );
}
