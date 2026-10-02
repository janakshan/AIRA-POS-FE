import { BoxesIcon, ShoppingBagIcon } from 'lucide-react';
import type { GuideSection } from '../guide-types';

/** Inventory (INV-001…006) and Purchasing (PUR-001…004). */
export const inventorySections: GuideSection[] = [
  {
    key: 'inventory',
    icon: BoxesIcon,
    roles: ['owner', 'manager', 'cashier', 'kitchen', 'rep'],
    tasks: [
      {
        key: 'checkStock',
        steps: [
          { key: 'open', shot: 'inventory-checkStock-1' },
          { key: 'filter' },
          { key: 'status' },
          { key: 'openItem', shot: 'inventory-checkStock-2' },
          { key: 'recent' },
        ],
      },
      {
        key: 'adjustStock',
        steps: [
          { key: 'open' },
          { key: 'pickItem', shot: 'inventory-adjustStock-1' },
          { key: 'kind', shot: 'inventory-adjustStock-2' },
          { key: 'quantity', shot: 'inventory-adjustStock-3' },
          { key: 'pin', shot: 'inventory-adjustStock-4' },
          { key: 'reason', shot: 'inventory-adjustStock-5' },
          { key: 'history', shot: 'inventory-adjustStock-6' },
        ],
      },
      {
        key: 'transferStock',
        steps: [
          { key: 'open' },
          { key: 'locations' },
          { key: 'items', shot: 'inventory-transferStock-1' },
          { key: 'note' },
          { key: 'dispatch', shot: 'inventory-transferStock-2' },
          { key: 'cancel' },
        ],
      },
      {
        key: 'receiveTransfer',
        steps: [
          { key: 'switch', shot: 'inventory-receiveTransfer-1' },
          { key: 'incoming' },
          { key: 'check', shot: 'inventory-receiveTransfer-2' },
          { key: 'receive', shot: 'inventory-receiveTransfer-3' },
        ],
      },
      {
        key: 'movements',
        steps: [
          { key: 'open' },
          { key: 'filter', shot: 'inventory-movements-1' },
          { key: 'read' },
          { key: 'fromItem' },
        ],
      },
      {
        key: 'lowStock',
        steps: [
          { key: 'open', shot: 'inventory-lowStock-1' },
          { key: 'minimum', shot: 'inventory-lowStock-2' },
          { key: 'transferIn', shot: 'inventory-lowStock-3' },
          { key: 'adjust' },
        ],
      },
    ],
  },
  {
    key: 'purchasing',
    icon: ShoppingBagIcon,
    roles: ['owner', 'manager'],
    tasks: [
      {
        key: 'suppliers',
        steps: [
          { key: 'open', shot: 'purchasing-suppliers-1' },
          { key: 'new' },
          { key: 'fill', shot: 'purchasing-suppliers-2' },
          { key: 'save', shot: 'purchasing-suppliers-3' },
          { key: 'deactivate' },
        ],
      },
      {
        key: 'createPo',
        steps: [
          { key: 'open' },
          { key: 'supplier' },
          { key: 'items' },
          { key: 'costs', shot: 'purchasing-createPo-1' },
          { key: 'save' },
        ],
      },
      {
        key: 'placePo',
        steps: [
          { key: 'open', shot: 'purchasing-placePo-1' },
          { key: 'edit' },
          { key: 'place', shot: 'purchasing-placePo-2' },
          { key: 'track' },
          { key: 'cancel' },
        ],
      },
      {
        key: 'receiveGoods',
        steps: [
          { key: 'open', shot: 'purchasing-receiveGoods-1' },
          { key: 'receive' },
          { key: 'count', shot: 'purchasing-receiveGoods-2' },
          { key: 'invoice' },
          { key: 'submit', shot: 'purchasing-receiveGoods-3' },
        ],
      },
    ],
  },
];
