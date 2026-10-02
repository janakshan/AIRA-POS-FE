import { CakeSliceIcon, ChefHatIcon } from 'lucide-react';
import type { GuideSection } from '../guide-types';

/** Production: recipes & kitchen prep (REC-001…005) and bakery production (BAK-001…005). */
export const productionSections: GuideSection[] = [
  {
    key: 'recipesKitchen',
    icon: ChefHatIcon,
    roles: ['owner', 'manager', 'kitchen'],
    tasks: [
      {
        key: 'ingredients',
        steps: [
          { key: 'open', shot: 'recipesKitchen-ingredients-1' },
          { key: 'read' },
          { key: 'edit', shot: 'recipesKitchen-ingredients-2' },
          { key: 'save' },
          { key: 'orderLow' },
        ],
      },
      {
        key: 'recipe',
        steps: [
          { key: 'open', shot: 'recipesKitchen-recipe-1' },
          { key: 'add' },
          { key: 'ingredients', shot: 'recipesKitchen-recipe-2' },
          { key: 'deduct' },
          { key: 'save' },
        ],
      },
      {
        key: 'canMake',
        steps: [
          { key: 'open' },
          { key: 'read', shot: 'recipesKitchen-canMake-1' },
          { key: 'ready' },
          { key: 'location' },
        ],
      },
      {
        key: 'portions',
        steps: [
          { key: 'open', shot: 'recipesKitchen-portions-1' },
          { key: 'expected' },
          { key: 'read', shot: 'recipesKitchen-portions-2' },
          { key: 'order' },
        ],
      },
      {
        key: 'prepared',
        steps: [
          { key: 'open', shot: 'recipesKitchen-prepared-1' },
          { key: 'filter' },
          { key: 'add', shot: 'recipesKitchen-prepared-2' },
          { key: 'dispose', shot: 'recipesKitchen-prepared-3' },
          { key: 'confirm' },
        ],
      },
    ],
  },
  {
    key: 'bakeryProduction',
    icon: CakeSliceIcon,
    roles: ['owner', 'manager'],
    tasks: [
      {
        key: 'overview',
        steps: [
          { key: 'open', shot: 'bakeryProduction-overview-1' },
          { key: 'shortage' },
          { key: 'tiles' },
          { key: 'batches' },
        ],
      },
      {
        key: 'plan',
        steps: [
          { key: 'open' },
          { key: 'details' },
          { key: 'quantities', shot: 'bakeryProduction-plan-1' },
          { key: 'save' },
          { key: 'confirm', shot: 'bakeryProduction-plan-2' },
        ],
      },
      {
        key: 'startBatch',
        steps: [
          { key: 'open', shot: 'bakeryProduction-startBatch-1' },
          { key: 'start' },
          { key: 'used', shot: 'bakeryProduction-startBatch-2' },
          { key: 'confirm' },
        ],
      },
      {
        key: 'recordOutput',
        steps: [
          { key: 'open' },
          { key: 'counts' },
          { key: 'reason', shot: 'bakeryProduction-recordOutput-1' },
          { key: 'confirm' },
          { key: 'detail', shot: 'bakeryProduction-recordOutput-2' },
        ],
      },
      {
        key: 'finishedGoods',
        steps: [
          { key: 'open', shot: 'bakeryProduction-finishedGoods-1' },
          { key: 'read' },
          { key: 'transfer' },
        ],
      },
      {
        key: 'wastage',
        steps: [
          { key: 'writeOff', shot: 'bakeryProduction-wastage-1' },
          { key: 'pin' },
          { key: 'reason', shot: 'bakeryProduction-wastage-2' },
          { key: 'review', shot: 'bakeryProduction-wastage-3' },
          { key: 'filter' },
        ],
      },
    ],
  },
];
