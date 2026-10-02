import { auditHandlers } from './audit';
import { authHandlers } from './auth';
import { catalogHandlers } from './catalog';
import { customerHandlers } from './customers';
import { dashboardHandlers } from './dashboard';
import { deliveryHandlers } from './delivery';
import { devHandlers } from './dev';
import { identityHandlers } from './identity';
import { orderHandlers } from './orders';
import { posHandlers } from './pos';
import { restaurantHandlers } from './restaurant';
import { inventoryHandlers } from './inventory';
import { purchasingHandlers } from './purchasing';
import { productionHandlers } from './production';
import { recipeHandlers } from './recipes';
import { reportHandlers } from './reports';
import { settingsHandlers } from './settings';
import { settingsSystemHandlers } from './settings-system';
import { staffHandlers } from './staff';
import { wholesaleHandlers } from './wholesale';

export const handlers = [
  ...authHandlers,
  ...identityHandlers,
  ...auditHandlers,
  ...catalogHandlers,
  ...customerHandlers,
  ...dashboardHandlers,
  ...posHandlers,
  ...orderHandlers,
  ...restaurantHandlers,
  ...deliveryHandlers,
  ...staffHandlers,
  ...reportHandlers,
  ...settingsHandlers,
  ...settingsSystemHandlers,
  ...inventoryHandlers,
  ...purchasingHandlers,
  ...recipeHandlers,
  ...productionHandlers,
  ...wholesaleHandlers,
  ...devHandlers,
];
