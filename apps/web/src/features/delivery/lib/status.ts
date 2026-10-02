import type { DeliveryStatus, Order } from '@rbp/types';
import type { StatusTone } from '@rbp/ui';

export const BOARD: DeliveryStatus[] = [
  'NEW',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export const TONE: Record<DeliveryStatus, StatusTone> = {
  NEW: 'info',
  CONFIRMED: 'info',
  PREPARING: 'progress',
  READY: 'warning',
  OUT_FOR_DELIVERY: 'progress',
  DELIVERED: 'success',
  CANCELLED: 'danger',
};

/** DEL-004 the one step forward from each status. */
export const NEXT: Partial<Record<DeliveryStatus, DeliveryStatus>> = {
  NEW: 'CONFIRMED',
  CONFIRMED: 'PREPARING',
  PREPARING: 'READY',
  READY: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
};

/** Steps a rider may take; the rest is the counter's. */
export const RIDER_STEPS: DeliveryStatus[] = ['OUT_FOR_DELIVERY', 'DELIVERED'];

export const deliveryCharge = (order: Order) =>
  order.totals.charges.find((c) => c.code === 'DELIVERY')?.amount ?? null;

const pad = (n: number) => String(n).padStart(2, '0');
export function localDay(days = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
