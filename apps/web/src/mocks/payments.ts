import type { PaymentMethod, PaymentMethodSetting } from '@rbp/types';
import { db } from './db';

const ALL: PaymentMethod[] = ['CASH', 'CARD', 'BANK_TRANSFER', 'CREDIT'];

/** SET-006: the business's payment methods; cash is always on. */
export function paymentMethodsFor(tenantId: string): PaymentMethodSetting[] {
  const own = db.get().paymentMethods[tenantId] ?? [];
  return ALL.map((method) => ({
    method,
    enabled: method === 'CASH' || (own.find((m) => m.method === method)?.enabled ?? true),
  }));
}

export const paymentMethodOn = (tenantId: string, method: PaymentMethod) =>
  paymentMethodsFor(tenantId).some((m) => m.method === method && m.enabled);
