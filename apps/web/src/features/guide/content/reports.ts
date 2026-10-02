import { BarChart3Icon } from 'lucide-react';
import type { GuideSection } from '../guide-types';

export const reportsSections: GuideSection[] = [
  {
    key: 'reports',
    icon: BarChart3Icon,
    roles: ['owner', 'manager'],
    tasks: [
      {
        key: 'salesSummary',
        steps: [
          { key: 'open', shot: 'reports-salesSummary-1' },
          { key: 'period' },
          { key: 'location', shot: 'reports-salesSummary-2' },
          { key: 'breakdowns', shot: 'reports-salesSummary-3' },
          { key: 'addUp', shot: 'reports-salesSummary-4' },
          { key: 'export' },
        ],
      },
      {
        key: 'productSales',
        steps: [
          { key: 'open', shot: 'reports-productSales-1' },
          { key: 'category' },
          { key: 'table', shot: 'reports-productSales-2' },
          { key: 'export' },
        ],
      },
      {
        key: 'locationSales',
        steps: [
          { key: 'open', shot: 'reports-locationSales-1' },
          { key: 'compare' },
          { key: 'trend' },
        ],
      },
      {
        key: 'stockReport',
        steps: [
          { key: 'open', shot: 'reports-stockReport-1' },
          { key: 'columns' },
          { key: 'filter', shot: 'reports-stockReport-2' },
          { key: 'export' },
        ],
      },
      {
        key: 'voids',
        steps: [
          { key: 'open', shot: 'reports-voids-1' },
          { key: 'tabs', shot: 'reports-voids-2' },
          { key: 'rows' },
          { key: 'summary', shot: 'reports-voids-3' },
        ],
      },
      {
        key: 'audit',
        steps: [
          { key: 'open', shot: 'reports-audit-1' },
          { key: 'filter' },
          { key: 'pin', shot: 'reports-audit-2' },
          { key: 'details', shot: 'reports-audit-3' },
          { key: 'changes', shot: 'reports-audit-4' },
          { key: 'export' },
        ],
      },
    ],
  },
];
