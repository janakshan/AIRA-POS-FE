import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';
import { RequireAccess, RequireAuth, RequireLocation } from '@/features/auth/components/guards';
import { LoginPage } from '@/features/auth/pages/login-page';
import { SelectLocationPage } from '@/features/auth/pages/select-location-page';
import { auditRoutes } from '@/features/audit/routes';
import { catalogRoutes } from '@/features/catalog/routes';
import { customerRoutes } from '@/features/customers/routes';
import { deliveryRoutes } from '@/features/delivery/routes';
import { guideRoute } from '@/features/guide/routes';
import { inventoryRoutes } from '@/features/inventory/routes';
import { productionRoutes } from '@/features/production/routes';
import { purchasingRoutes } from '@/features/purchasing/routes';
import { recipeRoutes } from '@/features/recipes/routes';
import { reportRoutes } from '@/features/reports/routes';
import { settingsRoutes } from '@/features/settings/routes';
import { staffRoutes } from '@/features/staff/routes';
import { wholesaleRoutes } from '@/features/wholesale/routes';
import { KitchenBoardPage } from '@/features/kitchen/pages/kitchen-board-page';
import { orderRoutes } from '@/features/orders/routes';
import { PlaceholderPage } from '@/features/placeholders/placeholder-page';
import { PosHomePage } from '@/features/pos/pages/pos-home-page';
import { restaurantRoutes } from '@/features/restaurant/routes';
import { HomeRoute } from '@/features/system/home-route';
import { NotFoundPage } from '@/features/system/not-found-page';
import { RouteErrorPage } from '@/features/system/route-error-page';
import { AppShell } from '@/layouts/app-shell';
import { KitchenLayout } from '@/layouts/kitchen-layout';
import { PosLayout } from '@/layouts/pos-layout';
import { env } from '@/lib/env';
import { ALL_NAV_ITEMS, LOCATION_DASHBOARD_ITEM, type NavItem } from '@/navigation/nav-config';
import { RootLayout } from './root-layout';

function byKey(key: string): NavItem {
  const item = ALL_NAV_ITEMS.find((i) => i.key === key);
  if (!item) throw new Error(`Unknown nav item "${key}"`);
  return item;
}

/** Real pages per nav key (lazy). Nav items without an entry still show the placeholder. */
const PAGE_ROUTES: Record<string, RouteObject[]> = {
  ...catalogRoutes,
  ...orderRoutes,
  ...auditRoutes,
  ...restaurantRoutes,
  ...customerRoutes,
  ...inventoryRoutes,
  ...purchasingRoutes,
  ...recipeRoutes,
  ...productionRoutes,
  ...wholesaleRoutes,
  ...deliveryRoutes,
  ...staffRoutes,
  ...reportRoutes,
  ...settingsRoutes,
};

/**
 * Every IA route is registered from nav-config so URLs, guards and screen IDs stay in one place.
 * The nav item's feature + permission guard wraps the page and any detail routes below it.
 */
const shellRoutes: RouteObject[] = ALL_NAV_ITEMS.filter((i) => !i.fullscreen).map((item) => ({
  path: item.path.slice(1),
  element: (
    <RequireAccess
      feature={item.feature}
      permission={item.permission}
      {...(item.orPermissions ? { orPermissions: item.orPermissions } : {})}
    >
      <Outlet />
    </RequireAccess>
  ),
  children: PAGE_ROUTES[item.key] ?? [{ index: true, element: <PlaceholderPage item={item} /> }],
}));

/** DASH-002 sits beside the dashboard, outside the IA groups, so it is wired here. */
const locationDashboardRoute: RouteObject = {
  path: LOCATION_DASHBOARD_ITEM.path.slice(1),
  element: (
    <RequireAccess
      feature={LOCATION_DASHBOARD_ITEM.feature}
      permission={LOCATION_DASHBOARD_ITEM.permission}
    >
      <Outlet />
    </RequireAccess>
  ),
  children: [
    {
      index: true,
      lazy: async () => ({
        Component: (await import('@/features/dashboard/pages/location-dashboard-page'))
          .LocationDashboardPage,
      }),
    },
  ],
};

/** DS-001 UI Kit: mock/dev builds only, lazy-loaded so it never ships in the real bundle's main chunk. */
const designSystemRoutes: RouteObject[] =
  env.devtoolsEnabled || import.meta.env.DEV
    ? [
        {
          path: 'design-system',
          lazy: async () => ({
            Component: (await import('@/features/design-system/pages/design-system-page'))
              .DesignSystemPage,
          }),
        },
      ]
    : [];

const pos = byKey('retailPos');
const kitchen = byKey('kitchen');

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/login', element: <LoginPage /> },
      guideRoute,
      {
        element: <RequireAuth />,
        children: [
          { path: '/select-location', element: <SelectLocationPage /> },
          {
            element: <RequireLocation />,
            children: [
              {
                path: '/',
                element: <AppShell />,
                children: [
                  { index: true, element: <HomeRoute /> },
                  locationDashboardRoute,
                  ...designSystemRoutes,
                  ...shellRoutes,
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
              {
                path: '/pos',
                element: (
                  <RequireAccess feature={pos.feature} permission={pos.permission}>
                    <PosLayout />
                  </RequireAccess>
                ),
                children: [{ index: true, element: <PosHomePage /> }],
              },
              {
                path: '/kitchen',
                element: (
                  <RequireAccess feature={kitchen.feature} permission={kitchen.permission}>
                    <KitchenLayout />
                  </RequireAccess>
                ),
                children: [{ index: true, element: <KitchenBoardPage /> }],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
