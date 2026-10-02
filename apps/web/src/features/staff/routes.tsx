import type { RouteObject } from 'react-router';

/** HR-001…006 (lazy), keyed by nav item; each nav item's HR/ATTENDANCE guard wraps them. */
export const staffRoutes: Record<string, RouteObject[]> = {
  employees: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/employees-page')).EmployeesPage }),
    },
    {
      path: ':id',
      lazy: async () => ({
        Component: (await import('./pages/employee-detail-page')).EmployeeDetailPage,
      }),
    },
  ],
  attendance: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/attendance-page')).AttendancePage }),
    },
  ],
  shifts: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/shifts-page')).ShiftsPage }),
    },
  ],
  staffMeals: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/staff-meals-page')).StaffMealsPage }),
    },
  ],
  foodAllowance: [
    {
      index: true,
      lazy: async () => ({ Component: (await import('./pages/allowance-page')).AllowancePage }),
    },
  ],
};
