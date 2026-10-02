import { TagsIcon, UsersIcon } from 'lucide-react';
import type { GuideSection } from '../guide-types';

/** Catalog (products, categories, location products, pricing, Quick Pad) and Customers. */
export const catalogSections: GuideSection[] = [
  {
    key: 'catalog',
    icon: TagsIcon,
    roles: ['owner', 'manager', 'cashier', 'waiter'],
    tasks: [
      {
        key: 'findProduct',
        steps: [
          { key: 'open', shot: 'catalog-findProduct-1' },
          { key: 'search' },
          { key: 'filter' },
          { key: 'openProduct', shot: 'catalog-findProduct-2' },
          { key: 'save' },
        ],
      },
      {
        key: 'addProduct',
        steps: [
          { key: 'open' },
          { key: 'details', shot: 'catalog-addProduct-1' },
          { key: 'translations' },
          { key: 'price', shot: 'catalog-addProduct-2' },
          { key: 'barcodes' },
          { key: 'options' },
          { key: 'save' },
        ],
      },
      {
        key: 'categories',
        steps: [
          { key: 'open' },
          { key: 'new', shot: 'catalog-categories-1' },
          { key: 'parent' },
          { key: 'colour' },
          { key: 'save' },
          { key: 'manage', shot: 'catalog-categories-2' },
        ],
      },
      {
        key: 'locationProducts',
        steps: [
          { key: 'open' },
          { key: 'location' },
          { key: 'soldHere', shot: 'catalog-locationProducts-1' },
          { key: 'available' },
          { key: 'stockNote' },
          { key: 'settings', shot: 'catalog-locationProducts-2' },
        ],
      },
      {
        key: 'pricing',
        steps: [
          { key: 'open' },
          { key: 'edit', shot: 'catalog-pricing-1' },
          { key: 'useBase' },
          { key: 'save' },
          { key: 'approve', shot: 'catalog-pricing-2' },
        ],
      },
      {
        key: 'quickPad',
        steps: [
          { key: 'open' },
          { key: 'choose' },
          { key: 'reorder', shot: 'catalog-quickPad-1' },
          { key: 'drill' },
          { key: 'colour', shot: 'catalog-quickPad-2' },
          { key: 'save' },
        ],
      },
    ],
  },
  {
    key: 'customers',
    icon: UsersIcon,
    roles: ['owner', 'manager', 'cashier', 'waiter'],
    tasks: [
      {
        key: 'findCustomer',
        steps: [
          { key: 'open', shot: 'customers-findCustomer-1' },
          { key: 'search' },
          { key: 'filter' },
          { key: 'openCustomer' },
        ],
      },
      {
        key: 'addCustomer',
        steps: [
          { key: 'open' },
          { key: 'details', shot: 'customers-addCustomer-1' },
          { key: 'phones' },
          { key: 'primary' },
          { key: 'address' },
          { key: 'save' },
        ],
      },
      {
        key: 'viewCustomer',
        steps: [
          { key: 'overview', shot: 'customers-viewCustomer-1' },
          { key: 'orders' },
          { key: 'orderDetail', shot: 'customers-viewCustomer-2' },
          { key: 'edit' },
        ],
      },
      {
        key: 'receivePayment',
        steps: [
          { key: 'open' },
          { key: 'method' },
          { key: 'amount', shot: 'customers-receivePayment-1' },
          { key: 'confirm', shot: 'customers-receivePayment-2' },
        ],
      },
    ],
  },
];
