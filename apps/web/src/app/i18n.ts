import type { LanguageCode } from '@rbp/types';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enAudit from '@/locales/en/audit.json';
import enAuth from '@/locales/en/auth.json';
import enCatalog from '@/locales/en/catalog.json';
import enCommon from '@/locales/en/common.json';
import enCustomers from '@/locales/en/customers.json';
import enDashboard from '@/locales/en/dashboard.json';
import enDelivery from '@/locales/en/delivery.json';
import enDesignSystem from '@/locales/en/designSystem.json';
import enDevtools from '@/locales/en/devtools.json';
import enInventory from '@/locales/en/inventory.json';
import enNav from '@/locales/en/nav.json';
import enOrders from '@/locales/en/orders.json';
import enPos from '@/locales/en/pos.json';
import enProduction from '@/locales/en/production.json';
import enPurchasing from '@/locales/en/purchasing.json';
import enRecipes from '@/locales/en/recipes.json';
import enReports from '@/locales/en/reports.json';
import enSettings from '@/locales/en/settings.json';
import enStaff from '@/locales/en/staff.json';
import enWholesale from '@/locales/en/wholesale.json';
import siAuth from '@/locales/si/auth.json';
import siCommon from '@/locales/si/common.json';
import siNav from '@/locales/si/nav.json';
import siSettings from '@/locales/si/settings.json';
import taAuth from '@/locales/ta/auth.json';
import taCommon from '@/locales/ta/common.json';
import taNav from '@/locales/ta/nav.json';
import taSettings from '@/locales/ta/settings.json';

export const LANGUAGES: { code: LanguageCode; label: string; locale: string }[] = [
  { code: 'en', label: 'English', locale: 'en-LK' },
  { code: 'ta', label: 'தமிழ்', locale: 'ta-LK' },
  { code: 'si', label: 'සිංහල', locale: 'si-LK' },
];

export const NAMESPACES = [
  'common',
  'nav',
  'audit',
  'auth',
  'catalog',
  'customers',
  'dashboard',
  'devtools',
  'designSystem',
  'inventory',
  'pos',
  'orders',
  'purchasing',
  'recipes',
  'production',
  'wholesale',
  'delivery',
  'staff',
  'settings',
  'reports',
] as const;

// Tamil/Sinhala are partial — missing keys fall back to English.
// TODO(P6): native-speaker review of TA/SI strings before client demo.
void i18n.use(initReactI18next).init({
  resources: {
    en: {
      common: enCommon,
      nav: enNav,
      audit: enAudit,
      auth: enAuth,
      catalog: enCatalog,
      customers: enCustomers,
      dashboard: enDashboard,
      devtools: enDevtools,
      designSystem: enDesignSystem,
      inventory: enInventory,
      pos: enPos,
      orders: enOrders,
      purchasing: enPurchasing,
      recipes: enRecipes,
      production: enProduction,
      wholesale: enWholesale,
      delivery: enDelivery,
      staff: enStaff,
      settings: enSettings,
      reports: enReports,
    },
    ta: { common: taCommon, nav: taNav, auth: taAuth, settings: taSettings },
    si: { common: siCommon, nav: siNav, auth: siAuth, settings: siSettings },
  },
  lng: 'en',
  fallbackLng: 'en',
  ns: NAMESPACES,
  defaultNS: 'common',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function localeFor(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.locale ?? 'en-LK';
}

export default i18n;
