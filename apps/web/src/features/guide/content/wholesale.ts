import {
  CalendarClockIcon,
  ClockIcon,
  HandCoinsIcon,
  MapIcon,
  ShoppingCartIcon,
  StoreIcon,
  Undo2Icon,
  UsersRoundIcon,
  UtensilsIcon,
  WalletIcon,
} from 'lucide-react';
import type { GuideSection } from '../guide-types';

/** Wholesale & field sales, and Staff (HR). Text: guide:sections.<key>… */
export const wholesaleSections: GuideSection[] = [
  {
    key: 'wholesaleShops',
    icon: StoreIcon,
    roles: ['owner', 'manager', 'rep'],
    tasks: [
      {
        key: 'findShop',
        steps: [
          { key: 'open', shot: 'wholesaleShops-find-1' },
          { key: 'totals' },
          { key: 'filter' },
          { key: 'openShop' },
        ],
      },
      {
        key: 'statement',
        steps: [
          { key: 'header', shot: 'wholesaleShops-statement-1' },
          { key: 'read' },
          { key: 'tabs' },
          { key: 'actions' },
        ],
      },
      {
        key: 'addShop',
        steps: [
          { key: 'open' },
          { key: 'details', shot: 'wholesaleShops-add-1' },
          { key: 'route' },
          { key: 'credit' },
          { key: 'save' },
        ],
      },
    ],
  },
  {
    key: 'wholesaleRoutes',
    icon: MapIcon,
    roles: ['owner', 'manager', 'rep'],
    tasks: [
      {
        key: 'followRoute',
        steps: [
          { key: 'open', shot: 'wholesaleRoutes-plan-1' },
          { key: 'pick' },
          { key: 'totals' },
          { key: 'stops' },
          { key: 'act' },
        ],
      },
      {
        key: 'vanStock',
        steps: [{ key: 'check', shot: 'wholesaleRoutes-van-1' }, { key: 'load' }],
      },
    ],
  },
  {
    key: 'fieldSales',
    icon: ShoppingCartIcon,
    roles: ['owner', 'manager', 'rep'],
    tasks: [
      {
        key: 'sell',
        steps: [
          { key: 'open', shot: 'fieldSales-sell-1', mobile: true },
          { key: 'goods', shot: 'fieldSales-sell-2', mobile: true },
          { key: 'review' },
          { key: 'payment', shot: 'fieldSales-sell-3', mobile: true },
          { key: 'create' },
        ],
      },
      {
        key: 'share',
        steps: [
          { key: 'invoice', shot: 'fieldSales-share-1', mobile: true },
          { key: 'print' },
          { key: 'send' },
          { key: 'next' },
        ],
      },
    ],
  },
  {
    key: 'wholesaleCollections',
    icon: HandCoinsIcon,
    roles: ['owner', 'manager', 'rep'],
    tasks: [
      {
        key: 'collect',
        steps: [
          { key: 'open' },
          { key: 'method', shot: 'wholesaleCollections-collect-1' },
          { key: 'amount' },
          { key: 'confirm' },
        ],
      },
      {
        key: 'review',
        steps: [
          { key: 'open', shot: 'wholesaleCollections-review-1' },
          { key: 'filter' },
          { key: 'applied' },
        ],
      },
    ],
  },
  {
    key: 'wholesaleReturns',
    icon: Undo2Icon,
    roles: ['owner', 'manager', 'rep'],
    tasks: [
      {
        key: 'record',
        steps: [
          { key: 'open' },
          { key: 'shop' },
          { key: 'items', shot: 'wholesaleReturns-record-1' },
          { key: 'pin' },
          { key: 'reason', shot: 'wholesaleReturns-record-2' },
        ],
      },
      {
        key: 'review',
        steps: [
          { key: 'list' },
          { key: 'detail', shot: 'wholesaleReturns-review-1' },
          { key: 'movements' },
        ],
      },
    ],
  },
  {
    key: 'staffEmployees',
    icon: UsersRoundIcon,
    roles: ['owner', 'manager'],
    tasks: [
      {
        key: 'find',
        steps: [{ key: 'open', shot: 'staffEmployees-find-1' }, { key: 'search' }, { key: 'read' }],
      },
      {
        key: 'detail',
        steps: [
          { key: 'open', shot: 'staffEmployees-detail-1' },
          { key: 'allowance' },
          { key: 'tabs' },
          { key: 'edit' },
        ],
      },
      {
        key: 'add',
        steps: [
          { key: 'open' },
          { key: 'details', shot: 'staffEmployees-add-1' },
          { key: 'pin' },
          { key: 'locations' },
          { key: 'save' },
        ],
      },
    ],
  },
  {
    key: 'staffAttendance',
    icon: ClockIcon,
    roles: ['owner', 'manager'],
    tasks: [
      {
        key: 'clock',
        steps: [
          { key: 'open' },
          { key: 'pin', shot: 'staffAttendance-clock-1' },
          { key: 'result' },
        ],
      },
      {
        key: 'sheet',
        steps: [
          { key: 'pick', shot: 'staffAttendance-sheet-1' },
          { key: 'counts' },
          { key: 'status' },
        ],
      },
    ],
  },
  {
    key: 'staffShifts',
    icon: CalendarClockIcon,
    roles: ['owner', 'manager'],
    tasks: [
      {
        key: 'roster',
        steps: [{ key: 'open', shot: 'staffShifts-roster-1' }, { key: 'week' }, { key: 'assign' }],
      },
      {
        key: 'cashMoves',
        steps: [
          { key: 'open' },
          { key: 'summary' },
          { key: 'record', shot: 'staffShifts-drawer-1' },
          { key: 'save' },
        ],
      },
      {
        key: 'closeShift',
        steps: [{ key: 'count', shot: 'staffShifts-drawer-2' }, { key: 'pin' }, { key: 'close' }],
      },
      {
        key: 'openShift',
        steps: [{ key: 'float', shot: 'staffShifts-drawer-3' }, { key: 'pin' }, { key: 'open' }],
      },
    ],
  },
  {
    key: 'staffMeals',
    icon: UtensilsIcon,
    roles: ['owner', 'manager'],
    tasks: [
      {
        key: 'record',
        steps: [
          { key: 'open' },
          { key: 'employee' },
          { key: 'items', shot: 'staffMeals-record-1' },
          { key: 'approve' },
        ],
      },
      {
        key: 'review',
        steps: [
          { key: 'list', shot: 'staffMeals-review-1' },
          { key: 'filter' },
          { key: 'allowance' },
        ],
      },
    ],
  },
  {
    key: 'staffAllowance',
    icon: WalletIcon,
    roles: ['owner', 'manager'],
    tasks: [
      {
        key: 'check',
        steps: [
          { key: 'open', shot: 'staffAllowance-review-1' },
          { key: 'month' },
          { key: 'read' },
          { key: 'copy' },
        ],
      },
      {
        key: 'set',
        steps: [{ key: 'open' }, { key: 'edit', shot: 'staffAllowance-set-1' }, { key: 'save' }],
      },
    ],
  },
];
