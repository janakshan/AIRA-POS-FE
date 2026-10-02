import { LayoutDashboardIcon, LogInIcon } from 'lucide-react';
import type { GuideSection } from '../guide-types';

export const basicsSections: GuideSection[] = [
  {
    key: 'start',
    icon: LogInIcon,
    roles: ['owner', 'manager', 'cashier', 'waiter', 'kitchen', 'rider', 'rep'],
    tasks: [
      {
        key: 'signIn',
        steps: [
          { key: 'open', shot: 'start-signIn-1' },
          { key: 'location', shot: 'start-signIn-2' },
          { key: 'home' },
        ],
      },
      {
        key: 'navigate',
        steps: [
          { key: 'sidebar', shot: 'start-navigate-1' },
          { key: 'switchLocation', shot: 'start-navigate-2' },
          { key: 'phone', shot: 'start-navigate-3', mobile: true },
        ],
      },
      {
        key: 'pin',
        steps: [{ key: 'when' }, { key: 'enter', shot: 'start-pin-1' }, { key: 'result' }],
      },
      {
        key: 'preferences',
        steps: [
          { key: 'menu', shot: 'start-preferences-1' },
          { key: 'language' },
          { key: 'theme' },
          { key: 'signOut' },
        ],
      },
    ],
  },
  {
    key: 'dashboard',
    icon: LayoutDashboardIcon,
    roles: ['owner', 'manager', 'cashier', 'waiter', 'rider', 'rep'],
    tasks: [
      {
        key: 'overview',
        steps: [
          { key: 'open', shot: 'dashboard-overview-1' },
          { key: 'cards' },
          { key: 'alerts' },
          { key: 'shortcuts' },
        ],
      },
    ],
  },
];
