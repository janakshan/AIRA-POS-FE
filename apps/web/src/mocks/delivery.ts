import type { DeliveryStatus, OrderDelivery } from '@rbp/types';
import { nowIso } from '@rbp/utils';

/** DEL-* status flow (§15). Cancelled is reached only through order cancel. */
export const DELIVERY_FLOW: DeliveryStatus[] = [
  'NEW',
  'CONFIRMED',
  'PREPARING',
  'READY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export const isForward = (from: DeliveryStatus, to: DeliveryStatus) =>
  DELIVERY_FLOW.indexOf(to) > DELIVERY_FLOW.indexOf(from);

/**
 * Move a delivery to `status`, recording who and when (DEL-002 timeline). Automatic updates
 * (kitchen, payment) only ever move forward; `force` is for cancellation.
 */
export function withDeliveryStatus<T extends { delivery: OrderDelivery | null }>(
  order: T,
  status: DeliveryStatus,
  by: string,
  force = false,
): T {
  if (!order.delivery) return order;
  if (!force && !isForward(order.delivery.status, status)) return order;
  return {
    ...order,
    delivery: {
      ...order.delivery,
      status,
      history: [...(order.delivery.history ?? []), { status, at: nowIso(), by }],
    },
  };
}
