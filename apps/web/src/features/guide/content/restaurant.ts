import { ArmchairIcon, BikeIcon, ChefHatIcon, UtensilsCrossedIcon } from 'lucide-react';
import type { GuideSection } from '../guide-types';

/** Restaurant: tables, restaurant POS order types, kitchen board and deliveries. */
export const restaurantSections: GuideSection[] = [
  {
    key: 'restaurantTables',
    icon: ArmchairIcon,
    roles: ['owner', 'manager', 'waiter'],
    tasks: [
      {
        key: 'floorPlan',
        steps: [
          { key: 'open', shot: 'restaurantTables-floorPlan-1' },
          { key: 'counts' },
          { key: 'tiles' },
          { key: 'unsent' },
        ],
      },
      {
        key: 'openTable',
        steps: [
          { key: 'tap' },
          { key: 'add', shot: 'restaurantTables-openTable-1' },
          { key: 'note', shot: 'restaurantTables-openTable-2' },
          { key: 'send', shot: 'restaurantTables-openTable-3' },
          { key: 'leave' },
          { key: 'more' },
        ],
      },
      {
        key: 'transferTable',
        steps: [
          { key: 'open' },
          { key: 'transfer', shot: 'restaurantTables-transferTable-1' },
          { key: 'pin', shot: 'restaurantTables-transferTable-2' },
          { key: 'reason', shot: 'restaurantTables-transferTable-3' },
          { key: 'done' },
        ],
      },
      {
        key: 'printBill',
        steps: [
          { key: 'open' },
          { key: 'print', shot: 'restaurantTables-printBill-1' },
          { key: 'status' },
          { key: 'pay' },
        ],
      },
    ],
  },
  {
    key: 'restaurantPos',
    icon: UtensilsCrossedIcon,
    roles: ['owner', 'manager', 'cashier', 'waiter'],
    tasks: [
      {
        key: 'orderTypes',
        steps: [
          { key: 'open', shot: 'restaurantPos-orderTypes-1' },
          { key: 'pick' },
          { key: 'dineIn' },
          { key: 'locked' },
        ],
      },
      {
        key: 'takeaway',
        steps: [
          { key: 'select' },
          { key: 'add' },
          { key: 'send', shot: 'restaurantPos-takeaway-1' },
          { key: 'pay' },
        ],
      },
      {
        key: 'delivery',
        steps: [
          { key: 'select' },
          { key: 'phone', shot: 'restaurantPos-delivery-1' },
          { key: 'save' },
          { key: 'send', shot: 'restaurantPos-delivery-2' },
          { key: 'finish' },
        ],
      },
      {
        key: 'serviceCharge',
        steps: [
          { key: 'automatic' },
          { key: 'open', shot: 'restaurantPos-serviceCharge-1' },
          { key: 'change' },
          { key: 'extra' },
        ],
      },
    ],
  },
  {
    key: 'kitchenBoard',
    icon: ChefHatIcon,
    roles: ['owner', 'manager', 'kitchen', 'waiter'],
    tasks: [
      {
        key: 'readBoard',
        steps: [
          { key: 'open', shot: 'kitchenBoard-readBoard-1' },
          { key: 'ticket' },
          { key: 'timer' },
          { key: 'station' },
        ],
      },
      {
        key: 'cookTicket',
        steps: [
          { key: 'start', shot: 'kitchenBoard-cookTicket-1' },
          { key: 'ready' },
          { key: 'complete' },
          { key: 'cancel' },
        ],
      },
      {
        key: 'printTicket',
        steps: [
          { key: 'tap' },
          { key: 'preview', shot: 'kitchenBoard-printTicket-1' },
          { key: 'again' },
        ],
      },
    ],
  },
  {
    key: 'deliveries',
    icon: BikeIcon,
    roles: ['owner', 'manager', 'cashier', 'rider'],
    tasks: [
      {
        key: 'dispatchBoard',
        steps: [
          { key: 'open', shot: 'deliveries-dispatchBoard-1' },
          { key: 'card' },
          { key: 'filter' },
        ],
      },
      {
        key: 'moveOrder',
        steps: [
          { key: 'confirm' },
          { key: 'kitchen', shot: 'deliveries-moveOrder-1' },
          { key: 'ready' },
        ],
      },
      {
        key: 'assignRider',
        steps: [
          { key: 'tap' },
          { key: 'choose', shot: 'deliveries-assignRider-1' },
          { key: 'assign' },
          { key: 'change' },
        ],
      },
      {
        key: 'riderRun',
        steps: [
          { key: 'open', shot: 'deliveries-riderRun-1', mobile: true },
          { key: 'out' },
          { key: 'delivered' },
          { key: 'collect', shot: 'deliveries-riderRun-2', mobile: true },
          { key: 'confirm' },
        ],
      },
      {
        key: 'deliveryDetail',
        steps: [
          { key: 'open', shot: 'deliveries-deliveryDetail-1' },
          { key: 'progress' },
          { key: 'slip' },
        ],
      },
    ],
  },
];
