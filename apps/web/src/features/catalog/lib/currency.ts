import type { CurrencyCode } from '@rbp/types';
import { useMe } from '@/features/auth/api/queries';

const SYMBOLS: Record<CurrencyCode, string> = { LKR: 'Rs.', USD: '$', INR: '₹' };

/** The tenant's currency and its input prefix (prices are always in the tenant currency). */
export function useTenantCurrency(): { currency: CurrencyCode; symbol: string } {
  const { data: me } = useMe();
  const currency = me?.tenant.currency ?? 'LKR';
  return { currency, symbol: SYMBOLS[currency] };
}
