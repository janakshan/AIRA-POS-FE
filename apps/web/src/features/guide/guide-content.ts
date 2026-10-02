import { basicsSections } from './content/basics';
import { catalogSections } from './content/catalog';
import { inventorySections } from './content/inventory';
import { posSections } from './content/pos';
import { productionSections } from './content/production';
import { reportsSections } from './content/reports';
import { restaurantSections } from './content/restaurant';
import { wholesaleSections } from './content/wholesale';
import type { GuideSection } from './guide-types';

/** Guide chapters in reading order. Text lives in the `guide` i18n namespace. */
export const GUIDE_SECTIONS: GuideSection[] = [
  ...basicsSections,
  ...posSections,
  ...restaurantSections,
  ...catalogSections,
  ...inventorySections,
  ...productionSections,
  ...wholesaleSections,
  ...reportsSections,
];

/** Screens that exist in the menu but are not built yet (still on PlaceholderPage). */
export const COMING_SOON = ['orders', 'staffReport', 'settings'] as const;

export const shotUrl = (shot: string) => `/guide/shots/${shot}.jpg`;
