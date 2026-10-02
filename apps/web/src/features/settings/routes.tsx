import type { RouteObject } from 'react-router';

/** SET-001…010 (lazy), keyed by nav item; the settings.manage guard wraps them. */
export const settingsRoutes: Record<string, RouteObject[]> = {
  business: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/business-page')).BusinessPage }),
    },
  ],
  devices: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/devices-page')).DevicesPage }),
    },
  ],
  payments: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/payments-page')).PaymentsPage }),
    },
  ],
  printers: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/printers-page')).PrintersPage }),
    },
  ],
  languages: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/languages-page')).LanguagesPage }),
    },
  ],
  features: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/features-page')).FeaturesPage }),
    },
  ],
  charges: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/charges-page')).ChargesPage }),
    },
  ],
  locations: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/locations-page')).LocationsPage }),
    },
  ],
  users: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/users-page')).UsersPage }),
    },
  ],
  roles: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/roles-page')).RolesPage }),
    },
    {
      path: 'new',
      lazy: async () => ({ Component: (await import('./pages/role-form-page')).RoleFormPage }),
    },
    {
      path: ':id',
      lazy: async () => ({ Component: (await import('./pages/role-form-page')).RoleFormPage }),
    },
  ],
};
