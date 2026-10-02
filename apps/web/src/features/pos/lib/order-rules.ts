import type { Order, OrderStatus } from '@rbp/types';
import type { StatusTone } from '@rbp/ui';

export const ORDER_TONE: Record<OrderStatus, StatusTone> = {
  PAID: 'success',
  HELD: 'info',
  OPEN: 'progress',
  CANCELLED: 'neutral',
  VOIDED: 'danger',
};

export const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

/** POS-011: a paid sale with something left to return. */
export const returnable = (o: Order) =>
  o.status === 'PAID' && o.lines.some((l) => l.quantity - l.returnedQuantity > 0);

/** POS-012 / A-225: why a paid sale can't be voided (returns → use Return; only same day). */
export const voidBlock = (o: Order): 'returns' | 'day' | null =>
  o.returns.length
    ? 'returns'
    : o.paidAt && new Date(o.paidAt).toDateString() !== new Date().toDateString()
      ? 'day'
      : null;
