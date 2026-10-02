import type { PurchaseOrder, PurchaseOrderLine, PurchaseOrderStatus } from '@rbp/types';
import type { StatusTone } from '@rbp/ui';

export const PO_STATUSES: PurchaseOrderStatus[] = [
  'DRAFT',
  'ORDERED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
];

export const PO_TONE: Record<PurchaseOrderStatus, StatusTone> = {
  DRAFT: 'neutral',
  ORDERED: 'info',
  PARTIALLY_RECEIVED: 'warning',
  RECEIVED: 'success',
  CANCELLED: 'danger',
};

/** Still to come on a line. */
export const outstanding = (l: PurchaseOrderLine) => Math.max(0, l.quantity - l.receivedQuantity);

export const isOpen = (po: PurchaseOrder) =>
  po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED';

/** Local today as YYYY-MM-DD (expected dates are plain dates). */
export function today() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const isOverdue = (po: PurchaseOrder) =>
  isOpen(po) && !!po.expectedDate && po.expectedDate < today();

/** Format a YYYY-MM-DD date without shifting it through UTC. */
export function formatPlainDate(date: string, locale: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
