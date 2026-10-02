import type { IsoDateTime, Money } from './common';
import type { Location } from './identity';

export interface DashboardSummary {
  asOf: IsoDateTime;
  salesToday: Money;
  ordersToday: number;
  averageOrderValue: Money;
  openTables: number;
  pendingKots: number;
  lowStockItems: number;
  hourlySales: { hour: number; amount: number }[];
}

/** DASH-002: one location's figures for today. */
export interface LocationDashboardRow extends Omit<DashboardSummary, 'asOf'> {
  location: Pick<Location, 'id' | 'code' | 'name' | 'type'>;
}

/** DASH-002 Location Dashboard: today across every location the user can see. */
export interface LocationDashboard {
  asOf: IsoDateTime;
  totals: {
    salesToday: Money;
    ordersToday: number;
    averageOrderValue: Money;
    lowStockItems: number;
  };
  locations: LocationDashboardRow[];
}
