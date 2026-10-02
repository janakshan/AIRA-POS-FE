import type { SensitiveActionContext } from './audit';
import type { IsoDateTime, LocationId, Money } from './common';
import type { Employee } from './identity';
import type { StockUnit } from './inventory';

/**
 * HR-001…006 staff (§22 staff meals, §23 food allowance, §24 attendance & shifts, SCN-005).
 * PROTOTYPE SHAPES — the source names the screens and the rules only; fields are assumptions
 * (A-278…). PINs never leave the server.
 */

/** HR-001 row: the employee plus what's live about them. */
export interface EmployeeView extends Employee {
  phone?: string;
  monthlyFoodAllowance: Money;
  /** Clocked in somewhere right now. */
  clockedIn: { locationId: LocationId; locationName: string; since: IsoDateTime } | null;
  /** Names for `locationIds` (in order), including locations the viewer can't open. */
  locations: { id: LocationId; name: string }[];
  /** This month's staff meals at sale price. */
  mealsThisMonth: Money;
  /** Linked login (User) and its role names. */
  login: { email: string; roles: string[] } | null;
}

export interface EmployeeListParams {
  search?: string;
  locationId?: string;
  active?: boolean;
}

export interface EmployeeRequest {
  fullName: string;
  jobTitle: string;
  phone?: string;
  locationIds: string[];
  /** 4 digits; required for new employees, omitted = keep. */
  pin?: string;
  /** Minor units. */
  monthlyFoodAllowance: number;
  isActive?: boolean;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  /** HH:MM local. */
  start: string;
  end: string;
}

export type AttendanceStatus =
  | 'ON_TIME'
  | 'LATE'
  | 'ABSENT'
  | 'UPCOMING'
  /** Worked without being on the roster. */
  | 'UNROSTERED'
  | 'OFF';

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  locationId: LocationId;
  locationName: string;
  /** YYYY-MM-DD (local) */
  date: string;
  clockInAt: IsoDateTime;
  clockOutAt: IsoDateTime | null;
  /** Worked so far (to now while clocked in). */
  minutes: number;
  method: 'PIN';
}

/** HR-003 day sheet: one row per employee at the location. */
export interface AttendanceRow {
  employeeId: string;
  employeeName: string;
  jobTitle: string;
  shift: ShiftTemplate | null;
  records: AttendanceRecord[];
  /** Clocked in now. */
  inNow: boolean;
  minutes: number;
  status: AttendanceStatus;
  /** Minutes after the shift start (LATE). */
  lateBy: number;
}

export interface AttendanceParams {
  /** YYYY-MM-DD; default today. */
  date?: string;
  locationId?: string;
  employeeId?: string;
}

export interface ClockRequest {
  pin: string;
  /** Default: the current location. */
  locationId?: string;
}

export interface ClockResponse {
  action: 'IN' | 'OUT';
  employee: { id: string; fullName: string };
  record: AttendanceRecord;
  shift: ShiftTemplate | null;
  lateBy: number;
}

/** HR-004 roster for one location and week. */
export interface RosterWeek {
  locationId: LocationId;
  /** Monday, YYYY-MM-DD. */
  weekStart: string;
  days: string[];
  templates: ShiftTemplate[];
  employees: { id: string; code: string; fullName: string; jobTitle: string }[];
  assignments: { employeeId: string; date: string; templateId: string }[];
}

export interface RosterAssignRequest {
  locationId: string;
  employeeId: string;
  date: string;
  /** null = off. */
  templateId: string | null;
}

export type CashShiftStatus = 'OPEN' | 'CLOSED';

export interface CashShiftEvent {
  id: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: Money;
  note: string;
  by: string;
  at: IsoDateTime;
}

/** HR-004 cash-drawer shift on one device (SCN-005 handover = close, then the next opens). */
export interface CashShift {
  id: string;
  /** SFT-000001 */
  number: string;
  locationId: LocationId;
  deviceId: string;
  deviceName: string;
  status: CashShiftStatus;
  openedBy: { employeeId: string; name: string };
  openedAt: IsoDateTime;
  openingFloat: Money;
  events: CashShiftEvent[];
  /** Derived: cash taken at the till during the shift. */
  cashSales: Money;
  cashRefunds: Money;
  /** float + cash sales − cash refunds + cash in − cash out. */
  expectedCash: Money;
  closedBy?: { employeeId: string; name: string };
  closedAt?: IsoDateTime;
  countedCash?: Money;
  /** counted − expected (negative = short). */
  variance?: Money;
  note?: string;
}

export interface OpenCashShiftRequest {
  pin: string;
  /** Minor units. */
  openingFloat: number;
}

export interface CashShiftEventRequest {
  type: 'CASH_IN' | 'CASH_OUT';
  amount: number;
  note: string;
}

export interface CloseCashShiftRequest {
  pin: string;
  countedCash: number;
  note?: string;
}

export interface StaffMealLine {
  productId: string;
  code: string;
  name: string;
  unit: StockUnit;
  quantity: number;
  /** Sale price at the location (§22 "1 Chicken Rice = Rs. 800"). */
  unitPrice: Money;
  lineValue: Money;
}

/** HR-005 food eaten by staff: no payment, stock still moves (§22). */
export interface StaffMeal {
  id: string;
  /** SML-000001 */
  number: string;
  employeeId: string;
  employeeName: string;
  locationId: LocationId;
  lines: StaffMealLine[];
  value: Money;
  source: 'HR' | 'POS';
  approvedBy: string;
  reason: { code: string; label: string; comment?: string };
  recordedBy: string;
  at: IsoDateTime;
  /** VOIDED meals stay listed, but their stock came back and they no longer count (A-312). */
  status: 'RECORDED' | 'VOIDED';
  voided?: StaffMealVoid;
}

/** Who voided a meal, who approved it with their PIN, and why. */
export interface StaffMealVoid {
  at: IsoDateTime;
  by: string;
  approvedBy: string;
  reason: { code: string; label: string; comment?: string };
}

export interface StaffMealListParams {
  /** YYYY-MM; default this month. */
  month?: string;
  employeeId?: string;
  locationId?: string;
}

export interface StaffMealRequest {
  employeeId: string;
  /** Default: the current location. */
  locationId?: string;
  lines: { productId: string; quantity: number }[];
  source?: 'HR' | 'POS';
  verification: SensitiveActionContext;
}

/** Same day only; puts back every stock movement the meal made (A-312). */
export interface StaffMealVoidRequest {
  verification: SensitiveActionContext;
}

/** HR-006 §23: allowance vs what was eaten, excess goes to salary deduction. */
export interface FoodAllowanceRow {
  employeeId: string;
  code: string;
  employeeName: string;
  jobTitle: string;
  allowance: Money;
  consumed: Money;
  remaining: Money;
  /** Over the allowance: for salary deduction / payroll. */
  excess: Money;
  meals: number;
}

export interface FoodAllowanceResponse {
  /** YYYY-MM */
  month: string;
  rows: FoodAllowanceRow[];
  totals: { allowance: Money; consumed: Money; excess: Money };
}
