import type { IsoDateTime, Money } from './common';

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
