import { queryKeys } from '@rbp/api-client';
import type {
  AttendanceParams,
  CashShiftEventRequest,
  ClockRequest,
  CloseCashShiftRequest,
  EmployeeListParams,
  EmployeeRequest,
  OpenCashShiftRequest,
  RosterAssignRequest,
  StaffMealListParams,
  StaffMealRequest,
  StaffMealVoidRequest,
} from '@rbp/types';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useQueryScope } from '@/features/auth/hooks/use-query-scope';
import { useInvalidateStock } from '@/features/inventory/api/queries';
import { api } from '@/lib/api';

/** HR-001…006. Staff meals move stock, so writes refresh stock + staff together. */

export function useStaffEmployees(params: EmployeeListParams = {}, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.staff.employees(scope, params),
    queryFn: ({ signal }) => api.staff.employees.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useStaffEmployee(id: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.staff.employee(scope, id ?? '-'),
    queryFn: ({ signal }) => api.staff.employees.get(id ?? '', signal),
    enabled: ready && !!id,
  });
}

export function useAttendanceDay(params: AttendanceParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.staff.attendance(scope, params),
    queryFn: ({ signal }) => api.staff.attendance.day(params, signal),
    enabled: ready && enabled && !!params.locationId,
    placeholderData: keepPreviousData,
    refetchInterval: 60_000,
  });
}

export function useAttendanceHistory(employeeId: string | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.staff.history(scope, employeeId ?? '-'),
    queryFn: ({ signal }) => api.staff.attendance.history(employeeId ?? '', signal),
    enabled: ready && !!employeeId,
  });
}

export function useRoster(locationId: string, weekStart: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.staff.roster(scope, locationId, weekStart),
    queryFn: ({ signal }) => api.staff.roster.get(locationId, weekStart, signal),
    enabled: ready && !!locationId,
    placeholderData: keepPreviousData,
  });
}

export function useCashShifts(locationId: string) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.staff.cashShifts(scope, locationId),
    queryFn: ({ signal }) => api.staff.cashShifts.list(locationId, signal),
    enabled: ready && !!locationId,
  });
}

export function useCurrentCashShift(deviceId: string | null | undefined) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.staff.currentShift(scope, deviceId),
    queryFn: ({ signal }) => api.staff.cashShifts.current(signal),
    enabled: ready && !!deviceId,
  });
}

export function useStaffMeals(params: StaffMealListParams, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.staff.meals(scope, params),
    queryFn: ({ signal }) => api.staff.meals.list(params, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

export function useFoodAllowance(month: string, enabled = true) {
  const { ready, ...scope } = useQueryScope();
  return useQuery({
    queryKey: queryKeys.staff.allowance(scope, month),
    queryFn: ({ signal }) => api.staff.allowance(month, signal),
    enabled: ready && enabled,
    placeholderData: keepPreviousData,
  });
}

function useStaffMutation<V, R>(fn: (vars: V) => Promise<R>) {
  const invalidate = useInvalidateStock();
  return useMutation({ mutationFn: fn, onSuccess: invalidate });
}

export const useSaveEmployee = () =>
  useStaffMutation(({ id, body }: { id?: string; body: EmployeeRequest }) =>
    id ? api.staff.employees.update(id, body) : api.staff.employees.create(body),
  );

export const useClock = () =>
  useStaffMutation((body: ClockRequest) => api.staff.attendance.clock(body));

export const useAssignShift = () =>
  useStaffMutation((body: RosterAssignRequest) => api.staff.roster.assign(body));

export const useOpenCashShift = () =>
  useStaffMutation((body: OpenCashShiftRequest) => api.staff.cashShifts.open(body));

export const useCashShiftEvent = () =>
  useStaffMutation(({ id, body }: { id: string; body: CashShiftEventRequest }) =>
    api.staff.cashShifts.event(id, body),
  );

export const useCloseCashShift = () =>
  useStaffMutation(({ id, body }: { id: string; body: CloseCashShiftRequest }) =>
    api.staff.cashShifts.close(id, body),
  );

export const useCreateStaffMeal = () =>
  useStaffMutation((body: StaffMealRequest) => api.staff.meals.create(body));

/** A-312: stock comes back and the allowance drops, so refresh both. */
export const useVoidStaffMeal = () =>
  useStaffMutation(({ id, body }: { id: string; body: StaffMealVoidRequest }) =>
    api.staff.meals.void(id, body),
  );
