import type { WholesalePaymentMethod } from '@rbp/types';
import { BanknoteIcon, LandmarkIcon, ReceiptTextIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** How shops pay (WHO-003 paid now, WHO-004 collections). */
export const METHODS: { method: WholesalePaymentMethod; icon: ReactNode }[] = [
  { method: 'CASH', icon: <BanknoteIcon /> },
  { method: 'BANK_TRANSFER', icon: <LandmarkIcon /> },
  { method: 'CHEQUE', icon: <ReceiptTextIcon /> },
];
