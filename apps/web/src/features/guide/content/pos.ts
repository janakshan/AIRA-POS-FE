import { HistoryIcon, ShoppingCartIcon } from 'lucide-react';
import type { GuideSection } from '../guide-types';

export const posSections: GuideSection[] = [
  {
    key: 'retailPos',
    icon: ShoppingCartIcon,
    roles: ['owner', 'manager', 'cashier'],
    tasks: [
      {
        key: 'findProducts',
        steps: [
          { key: 'open', shot: 'retailPos-findProducts-1' },
          { key: 'tiles' },
          { key: 'search', shot: 'retailPos-findProducts-2' },
          { key: 'fullSearch', shot: 'retailPos-findProducts-3' },
          { key: 'scan' },
        ],
      },
      {
        key: 'buildCart',
        steps: [
          { key: 'select', shot: 'retailPos-buildCart-1' },
          { key: 'stepper' },
          { key: 'qty' },
          { key: 'remove' },
          { key: 'clear' },
        ],
      },
      {
        key: 'addCustomer',
        steps: [
          { key: 'open' },
          { key: 'phone', shot: 'retailPos-addCustomer-1' },
          { key: 'name' },
          { key: 'create', shot: 'retailPos-addCustomer-2' },
          { key: 'remove' },
        ],
      },
      {
        key: 'discount',
        steps: [
          { key: 'open', shot: 'retailPos-discount-1' },
          { key: 'value' },
          { key: 'pin', shot: 'retailPos-discount-2' },
          { key: 'reason', shot: 'retailPos-discount-3' },
          { key: 'price' },
        ],
      },
      {
        key: 'charges',
        steps: [
          { key: 'open', shot: 'retailPos-charges-1' },
          { key: 'default' },
          { key: 'custom' },
          { key: 'remove' },
        ],
      },
      {
        key: 'takePayment',
        steps: [
          { key: 'pay' },
          { key: 'cash', shot: 'retailPos-takePayment-1' },
          { key: 'other' },
          { key: 'take' },
          { key: 'receipt', shot: 'retailPos-takePayment-2' },
        ],
      },
    ],
  },
  {
    key: 'retailPosManage',
    icon: HistoryIcon,
    roles: ['owner', 'manager', 'cashier'],
    tasks: [
      {
        key: 'holdSale',
        steps: [
          { key: 'hold' },
          { key: 'list', shot: 'retailPosManage-holdSale-1' },
          { key: 'resume' },
          { key: 'saved', shot: 'retailPosManage-holdSale-2' },
          { key: 'cancel' },
        ],
      },
      {
        key: 'salesHistory',
        steps: [
          { key: 'open', shot: 'retailPosManage-salesHistory-1' },
          { key: 'find' },
          { key: 'receipt' },
          { key: 'void' },
        ],
      },
      {
        key: 'returnSale',
        steps: [
          { key: 'open' },
          { key: 'pick', shot: 'retailPosManage-returnSale-1' },
          { key: 'method' },
          { key: 'approve' },
          { key: 'receipt', shot: 'retailPosManage-returnSale-2' },
        ],
      },
      {
        key: 'openDrawer',
        steps: [
          { key: 'button' },
          { key: 'pin' },
          { key: 'reason', shot: 'retailPosManage-openDrawer-1' },
        ],
      },
    ],
  },
];
