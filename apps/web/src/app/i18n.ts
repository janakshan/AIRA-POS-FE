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
import siAudit from '@/locales/si/audit.json';
import siAuth from '@/locales/si/auth.json';
import siCatalog from '@/locales/si/catalog.json';
import siCommon from '@/locales/si/common.json';
import siCustomers from '@/locales/si/customers.json';
import siDashboard from '@/locales/si/dashboard.json';
import siDelivery from '@/locales/si/delivery.json';
import siInventory from '@/locales/si/inventory.json';
import siNav from '@/locales/si/nav.json';
import siOrders from '@/locales/si/orders.json';
import siPos from '@/locales/si/pos.json';
import siProduction from '@/locales/si/production.json';
import siPurchasing from '@/locales/si/purchasing.json';
import siRecipes from '@/locales/si/recipes.json';
import siReports from '@/locales/si/reports.json';
import siSettings from '@/locales/si/settings.json';
import siStaff from '@/locales/si/staff.json';
import siWholesale from '@/locales/si/wholesale.json';
import taAudit from '@/locales/ta/audit.json';
import taAuth from '@/locales/ta/auth.json';
import taCatalog from '@/locales/ta/catalog.json';
import taCommon from '@/locales/ta/common.json';
import taCustomers from '@/locales/ta/customers.json';
import taDashboard from '@/locales/ta/dashboard.json';
import taDelivery from '@/locales/ta/delivery.json';
import taInventory from '@/locales/ta/inventory.json';
import taNav from '@/locales/ta/nav.json';
import taOrders from '@/locales/ta/orders.json';
import taPos from '@/locales/ta/pos.json';
import taProduction from '@/locales/ta/production.json';
import taPurchasing from '@/locales/ta/purchasing.json';
import taRecipes from '@/locales/ta/recipes.json';
import taReports from '@/locales/ta/reports.json';
import taSettings from '@/locales/ta/settings.json';
import taStaff from '@/locales/ta/staff.json';
import taWholesale from '@/locales/ta/wholesale.json';

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

// Tamil/Sinhala cover every user-facing namespace; dev-only ones (devtools,
// designSystem) and any missing key fall back to English.
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
    ta: {
      audit: taAudit,
      auth: taAuth,
      catalog: taCatalog,
      common: taCommon,
      customers: taCustomers,
      dashboard: taDashboard,
      delivery: taDelivery,
      inventory: taInventory,
      nav: taNav,
      orders: taOrders,
      pos: taPos,
      production: taProduction,
      purchasing: taPurchasing,
      recipes: taRecipes,
      reports: taReports,
      settings: taSettings,
      staff: taStaff,
      wholesale: taWholesale,
    },
    si: {
      audit: siAudit,
      auth: siAuth,
      catalog: siCatalog,
      common: siCommon,
      customers: siCustomers,
      dashboard: siDashboard,
      delivery: siDelivery,
      inventory: siInventory,
      nav: siNav,
      orders: siOrders,
      pos: siPos,
      production: siProduction,
      purchasing: siPurchasing,
      recipes: siRecipes,
      reports: siReports,
      settings: siSettings,
      staff: siStaff,
      wholesale: siWholesale,
    },
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
