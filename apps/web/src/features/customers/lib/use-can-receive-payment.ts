import { useAccess } from '@/features/auth/hooks/use-access';

/** Whoever handles cash (drawer) or manages customers can take payments on account. */
export function useCanReceivePayment() {
  const { can } = useAccess();
  return can('pos.drawer.open') || can('customer.manage');
}
