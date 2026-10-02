import type { CustomerDetail } from '@rbp/types';
import { useOutletContext } from 'react-router';

/** What the CUS-003/004/005 tabs get from the shared detail layout. */
export interface CustomerOutletContext {
  customer: CustomerDetail;
}

export const useCustomerContext = () => useOutletContext<CustomerOutletContext>();
