import type {
  AttendanceRecord,
  AttendanceRow,
  CashShift,
  ClockResponse,
  EmployeeView,
  FeatureCode,
  FoodAllowanceResponse,
  Money,
  Permission,
  RosterWeek,
  ShiftTemplate,
  StaffMeal,
} from '@rbp/types';
import {
  cashShiftEventSchema,
  clockSchema,
  closeCashShiftSchema,
  employeeSchema,
  openCashShiftSchema,
  rosterAssignSchema,
  staffMealSchema,
  staffMealVoidSchema,
} from '@rbp/validation';
import { newId, nowIso } from '@rbp/utils';
import { http, HttpResponse } from 'msw';
import {
  employeePermissions,
  recordAudit,
  requireVerifiedAction,
  type VerifiedAction,
} from '../audit';
import { type MockContext, requireFeature, requirePermission, resolveContext } from '../context';
import { db } from '../db';
import type { CashShiftRecord, MockDb, MockEmployeeRecord } from '../db/seed';
import { API, handle, MockHttpError, parseBody } from '../http';
import { nextInventoryNumber, postMovement, settingKey } from '../inventory';
import { locationName, myLocationIds, requireLocationAccess } from '../location';
import { assertCanSell, postSaleStock } from '../recipes';

/**
 * HR-001…006 (prototype): employees, PIN clock in/out, roster, cash-drawer shifts (SCN-005),
 * staff meals that move stock without payment (§22) and the monthly food allowance (§23).
 */

export const DEFAULT_ALLOWANCE = 500_000;
export const GRACE_MINUTES = 10;

function staffContext(request: Request, feature: FeatureCode, permission?: Permission) {
  const ctx = resolveContext(request);
  requireFeature(ctx, feature);
  if (permission) requirePermission(ctx, permission);
  return ctx;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const localDate = (d: Date | string = new Date()) => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
/** Local time `HH:MM` on a YYYY-MM-DD. */
export const at = (date: string, hhmm: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
};
const minutesBetween = (a: string | Date, b: string | Date) =>
  Math.max(0, Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 60_000));

const money = (ctx: MockContext, amount: number): Money => ({
  amount,
  currency: ctx.me.tenant.currency,
});

const employeesOf = (state: MockDb, tenantId: string) =>
  state.employees.filter((e) => e.tenantId === tenantId);

function findEmployee(ctx: MockContext, id: string) {
  const e = employeesOf(db.get(), ctx.me.tenant.id).find((x) => x.id === id);
  if (!e) throw new MockHttpError('NOT_FOUND', 404, 'Employee not found');
  return e;
}

/** A PIN typed on a shared device (HR-003, cash shifts). */
function employeeByPin(ctx: MockContext, pin: string, locationId: string) {
  const e = employeesOf(db.get(), ctx.me.tenant.id).find((x) => x.pin === pin && x.isActive);
  if (!e) throw new MockHttpError('INVALID_PIN', 400, 'Incorrect PIN');
  if (!e.locationIds.includes(locationId as MockEmployeeRecord['locationIds'][number])) {
    throw new MockHttpError(
      'EMPLOYEE_WRONG_LOCATION',
      403,
      `${e.fullName} doesn't work at ${locationName(locationId)}`,
      { employeeName: e.fullName, locationId, location: locationName(locationId) },
    );
  }
  return e;
}

const monthOf = (iso: string) => localDate(iso).slice(0, 7);

/** A voided meal no longer counts as eaten (HR-006) or in reports (A-312). */
export const mealCounts = (m: Pick<StaffMeal, 'status'>) => m.status !== 'VOIDED';

const mealsOfMonth = (state: MockDb, tenantId: string, employeeId: string, month: string) =>
  state.staffMeals.filter(
    (m) =>
      m.tenantId === tenantId &&
      m.employeeId === employeeId &&
      monthOf(m.at) === month &&
      mealCounts(m),
  );

function mealsValue(state: MockDb, tenantId: string, employeeId: string, month: string) {
  return mealsOfMonth(state, tenantId, employeeId, month).reduce((s, m) => s + m.value.amount, 0);
}

/**
 * A-312 void, mirroring POS-012: every STAFF_MEAL movement the meal made (other items and recipe
 * ingredients alike) comes back as RETURN against a VOID reference. Prepared plates it used
 * aren't re-queued, as for a voided sale.
 */
function reverseMealStock(ctx: MockContext, meal: StaffMeal, verified: VerifiedAction) {
  const taken = new Map<string, number>();
  for (const m of db.get().stockMovements) {
    if (
      m.tenantId === ctx.me.tenant.id &&
      m.type === 'STAFF_MEAL' &&
      m.reference.kind === 'STAFF_MEAL' &&
      m.reference.id === meal.id
    ) {
      const key = settingKey(m.productId, m.locationId);
      taken.set(key, (taken.get(key) ?? 0) - m.quantity);
    }
  }
  for (const [key, quantity] of taken) {
    const [productId = '', locationId = ''] = key.split(':');
    if (quantity <= 0) continue;
    postMovement(ctx, {
      productId,
      locationId,
      type: 'RETURN',
      quantity,
      reference: { kind: 'VOID', id: meal.id, number: meal.number },
      reason: verified.reason,
      approvedBy: verified.employee.fullName,
      note: 'Staff meal voided',
    });
  }
}

function employeeView(ctx: MockContext, e: MockEmployeeRecord): EmployeeView {
  const state = db.get();
  const { pin: _p, ...rest } = e;
  const open = state.attendance.find(
    (a) => a.tenantId === e.tenantId && a.employeeId === e.id && !a.clockOutAt,
  );
  const tu = state.tenantUsers.find((t) => t.tenantId === e.tenantId && t.employeeId === e.id);
  const user = tu ? state.users.find((u) => u.id === tu.userId) : undefined;
  return {
    ...rest,
    monthlyFoodAllowance: e.monthlyFoodAllowance ?? money(ctx, DEFAULT_ALLOWANCE),
    clockedIn: open
      ? {
          locationId: open.locationId,
          locationName: locationName(open.locationId),
          since: open.clockInAt,
        }
      : null,
    locations: e.locationIds.map((id) => ({ id, name: locationName(id) })),
    mealsThisMonth: money(ctx, mealsValue(state, e.tenantId, e.id, monthOf(nowIso()))),
    login:
      tu && user
        ? {
            email: user.email,
            roles: state.roles.filter((r) => tu.roleIds.includes(r.id)).map((r) => r.name),
          }
        : null,
  };
}

function recordView(state: MockDb, r: MockDb['attendance'][number]): AttendanceRecord {
  const { tenantId: _t, ...rest } = r;
  return {
    ...rest,
    employeeName: state.employees.find((e) => e.id === r.employeeId)?.fullName ?? r.employeeId,
    locationName: locationName(r.locationId),
    minutes: minutesBetween(r.clockInAt, r.clockOutAt ?? nowIso()),
  };
}

const templatesOf = (state: MockDb, tenantId: string): ShiftTemplate[] =>
  state.shiftTemplates.filter((t) => t.tenantId === tenantId).map(({ tenantId: _t, ...t }) => t);

function shiftFor(
  state: MockDb,
  tenantId: string,
  employeeId: string,
  locationId: string,
  date: string,
) {
  const a = state.rosterAssignments.find(
    (x) =>
      x.tenantId === tenantId &&
      x.employeeId === employeeId &&
      x.locationId === locationId &&
      x.date === date,
  );
  return a ? (templatesOf(state, tenantId).find((t) => t.id === a.templateId) ?? null) : null;
}

/** HR-003 status of one employee on one day at one location (also REP-007). */
export function attendanceRow(
  state: MockDb,
  e: MockEmployeeRecord,
  locationId: string,
  date: string,
): AttendanceRow {
  const records = state.attendance
    .filter(
      (a) =>
        a.tenantId === e.tenantId &&
        a.employeeId === e.id &&
        a.locationId === locationId &&
        a.date === date,
    )
    .sort((a, b) => a.clockInAt.localeCompare(b.clockInAt))
    .map((r) => recordView(state, r));
  const shift = shiftFor(state, e.tenantId, e.id, locationId, date);
  const now = new Date();
  let status: AttendanceRow['status'] = 'OFF';
  let lateBy = 0;
  if (shift) {
    const start = at(date, shift.start);
    if (records.length) {
      lateBy = minutesBetween(start, records[0]!.clockInAt);
      status = lateBy > GRACE_MINUTES ? 'LATE' : 'ON_TIME';
    } else {
      status = now.getTime() > start.getTime() + GRACE_MINUTES * 60_000 ? 'ABSENT' : 'UPCOMING';
    }
  } else if (records.length) {
    status = 'UNROSTERED';
  }
  return {
    employeeId: e.id,
    employeeName: e.fullName,
    jobTitle: e.jobTitle,
    shift,
    records,
    inNow: records.some((r) => !r.clockOutAt),
    minutes: records.reduce((s, r) => s + r.minutes, 0),
    status,
    lateBy: status === 'LATE' ? lateBy : 0,
  };
}

/** Monday of the week containing `date`. */
function mondayOf(date: string) {
  const d = at(date, '12:00');
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return localDate(d);
}

function rosterWeek(ctx: MockContext, locationId: string, weekStart: string): RosterWeek {
  const state = db.get();
  const monday = mondayOf(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = at(monday, '12:00');
    d.setDate(d.getDate() + i);
    return localDate(d);
  });
  return {
    locationId: locationId as RosterWeek['locationId'],
    weekStart: monday,
    days,
    templates: templatesOf(state, ctx.me.tenant.id),
    employees: employeesOf(state, ctx.me.tenant.id)
      .filter((e) => e.isActive && e.locationIds.includes(locationId as never))
      .map((e) => ({ id: e.id, code: e.code, fullName: e.fullName, jobTitle: e.jobTitle })),
    assignments: state.rosterAssignments
      .filter(
        (a) =>
          a.tenantId === ctx.me.tenant.id && a.locationId === locationId && days.includes(a.date),
      )
      .map(({ employeeId, date, templateId }) => ({ employeeId, date, templateId })),
  };
}

/** Cash totals for a drawer shift, from the till's own payments on that device. */
export function cashShiftView(state: MockDb, s: CashShiftRecord): CashShift {
  const { tenantId, ...rest } = s;
  const from = s.openedAt;
  const to = s.closedAt ?? '9999';
  let sales = 0;
  let refunds = 0;
  for (const o of state.orders) {
    if (o.tenantId !== tenantId || o.deviceId !== s.deviceId) continue;
    for (const p of o.payments) {
      if (p.method !== 'CASH' || p.createdAt < from || p.createdAt > to) continue;
      if (p.kind === 'SALE') sales += p.amount.amount;
      else refunds += p.amount.amount;
    }
  }
  const events = s.events.reduce(
    (n, e) => n + (e.type === 'CASH_IN' ? e.amount.amount : -e.amount.amount),
    0,
  );
  const currency = s.openingFloat.currency;
  const expected = s.openingFloat.amount + sales - refunds + events;
  return {
    ...rest,
    cashSales: { amount: sales, currency },
    cashRefunds: { amount: refunds, currency },
    expectedCash: { amount: expected, currency },
    ...(s.countedCash ? { variance: { amount: s.countedCash.amount - expected, currency } } : {}),
  };
}

function findCashShift(ctx: MockContext, id: string) {
  const s = db.get().cashShifts.find((x) => x.id === id && x.tenantId === ctx.me.tenant.id);
  if (!s) throw new MockHttpError('NOT_FOUND', 404, 'Shift not found');
  return s;
}

const tillDevice = (ctx: MockContext) => {
  const device = ctx.me.device;
  if (!device) {
    throw new MockHttpError('VALIDATION_FAILED', 400, 'Cash shifts run on a device', {
      reason: 'DEVICE_REQUIRED',
    });
  }
  return device;
};

/** Only someone who may run the till opens or closes (counts) a drawer shift. */
function requireTillRights(ctx: MockContext, employee: MockEmployeeRecord) {
  if (!employeePermissions(ctx.me.tenant.id, employee.id).has('pos.drawer.open')) {
    throw new MockHttpError(
      'EMPLOYEE_NOT_AUTHORIZED',
      403,
      `${employee.fullName} can't run the till`,
      {
        permission: 'pos.drawer.open',
      },
    );
  }
}

/** Staff meals come off the counter (anyone who sells) or HR (staff.manage). */
function mealContext(request: Request) {
  const ctx = resolveContext(request, { requireLocation: true });
  requireFeature(ctx, 'HR');
  if (!ctx.permissions.has('staff.manage')) requirePermission(ctx, 'pos.sale.create');
  return ctx;
}

export const staffHandlers = [
  /** HR-001 */
  http.get(
    `${API}/staff/employees`,
    handle(({ request }) => {
      const ctx = staffContext(request, 'HR', 'staff.view');
      const url = new URL(request.url);
      const q = url.searchParams.get('search')?.trim().toLowerCase();
      const locationId = url.searchParams.get('locationId');
      const active = url.searchParams.get('active');
      const mine = myLocationIds(ctx);
      const items = employeesOf(db.get(), ctx.me.tenant.id)
        .filter((e) => e.locationIds.some((l) => mine.includes(l)))
        .filter((e) => !locationId || e.locationIds.includes(locationId as never))
        .filter((e) => active === null || String(e.isActive) === active)
        .filter(
          (e) =>
            !q ||
            [e.fullName, e.code, e.jobTitle, e.phone ?? ''].some((v) =>
              v.toLowerCase().includes(q),
            ),
        )
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((e) => employeeView(ctx, e));
      return HttpResponse.json(items);
    }),
  ),

  http.get(
    `${API}/staff/employees/:id`,
    handle(({ request, params }) => {
      const ctx = staffContext(request, 'HR', 'staff.view');
      return HttpResponse.json(employeeView(ctx, findEmployee(ctx, String(params.id))));
    }),
  ),

  http.post(
    `${API}/staff/employees`,
    handle(async ({ request }) => {
      const ctx = staffContext(request, 'HR', 'staff.manage');
      const input = await parseBody(request, employeeSchema);
      input.locationIds.forEach((l) => requireLocationAccess(ctx, l));
      if (!input.pin) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'PIN required', {
          fieldErrors: { pin: 'validation.pinFormat' },
        });
      }
      const state = db.get();
      if (employeesOf(state, ctx.me.tenant.id).some((e) => e.pin === input.pin)) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'PIN in use', {
          fieldErrors: { pin: 'validation.pinTaken' },
        });
      }
      const count = employeesOf(state, ctx.me.tenant.id).length;
      const record: MockEmployeeRecord = {
        id: newId('emp') as MockEmployeeRecord['id'],
        tenantId: ctx.me.tenant.id,
        code: `E${String(count + 1).padStart(3, '0')}`,
        fullName: input.fullName,
        jobTitle: input.jobTitle,
        ...(input.phone ? { phone: input.phone } : {}),
        locationIds: input.locationIds as MockEmployeeRecord['locationIds'],
        monthlyFoodAllowance: money(ctx, input.monthlyFoodAllowance),
        joinedAt: localDate(),
        isActive: input.isActive ?? true,
        pin: input.pin,
      };
      db.update((d) => {
        d.employees.push(record);
      });
      recordAudit(ctx, {
        action: 'staff.employee.create',
        entity: 'employee',
        entityId: record.id,
        entityLabel: `${record.code} ${record.fullName} · ${record.jobTitle}`,
        before: null,
        after: { ...record, pin: '••••' },
      });
      return HttpResponse.json(employeeView(ctx, record), { status: 201 });
    }),
  ),

  http.put(
    `${API}/staff/employees/:id`,
    handle(async ({ request, params }) => {
      const ctx = staffContext(request, 'HR', 'staff.manage');
      const before = findEmployee(ctx, String(params.id));
      const input = await parseBody(request, employeeSchema);
      // Only locations being added or removed need the caller's access: a manager editing someone
      // who also works at a location they can't see keeps it (the form sends it back unchanged).
      const had = new Set<string>(before.locationIds);
      const changed = [
        ...input.locationIds.filter((l) => !had.has(l)),
        ...before.locationIds.filter((l) => !input.locationIds.includes(l)),
      ];
      changed.forEach((l) => requireLocationAccess(ctx, l));
      if (
        input.pin &&
        employeesOf(db.get(), ctx.me.tenant.id).some(
          (e) => e.pin === input.pin && e.id !== before.id,
        )
      ) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'PIN in use', {
          fieldErrors: { pin: 'validation.pinTaken' },
        });
      }
      const { phone: _p, ...base } = before;
      const record: MockEmployeeRecord = {
        ...base,
        fullName: input.fullName,
        jobTitle: input.jobTitle,
        ...(input.phone ? { phone: input.phone } : {}),
        locationIds: input.locationIds as MockEmployeeRecord['locationIds'],
        monthlyFoodAllowance: money(ctx, input.monthlyFoodAllowance),
        isActive: input.isActive ?? before.isActive,
        pin: input.pin ?? before.pin,
      };
      db.update((d) => {
        d.employees = d.employees.map((e) => (e.id === before.id ? record : e));
      });
      recordAudit(ctx, {
        action: input.pin ? 'staff.employee.pin' : 'staff.employee.update',
        entity: 'employee',
        entityId: record.id,
        entityLabel: `${record.code} ${record.fullName}${input.pin ? ' · PIN changed' : ''}`,
        before: { ...before, pin: '••••' },
        after: { ...record, pin: '••••' },
      });
      return HttpResponse.json(employeeView(ctx, record));
    }),
  ),

  /** HR-003 day sheet. */
  http.get(
    `${API}/staff/attendance`,
    handle(({ request }) => {
      const ctx = staffContext(request, 'ATTENDANCE', 'staff.view');
      const url = new URL(request.url);
      const locationId = url.searchParams.get('locationId') ?? ctx.me.currentLocation?.id;
      if (!locationId) throw new MockHttpError('VALIDATION_FAILED', 400, 'Choose a location');
      requireLocationAccess(ctx, locationId);
      const date = url.searchParams.get('date') ?? localDate();
      const state = db.get();
      const rows = employeesOf(state, ctx.me.tenant.id)
        .filter((e) => e.isActive && e.locationIds.includes(locationId as never))
        .map((e) => attendanceRow(state, e, locationId, date))
        .sort(
          (a, b) =>
            (a.shift?.start ?? '99').localeCompare(b.shift?.start ?? '99') ||
            a.employeeName.localeCompare(b.employeeName),
        );
      return HttpResponse.json(rows);
    }),
  ),

  http.get(
    `${API}/staff/attendance/history`,
    handle(({ request }) => {
      const ctx = staffContext(request, 'ATTENDANCE', 'staff.view');
      const employeeId = new URL(request.url).searchParams.get('employeeId') ?? '';
      findEmployee(ctx, employeeId);
      const state = db.get();
      return HttpResponse.json(
        state.attendance
          .filter((a) => a.tenantId === ctx.me.tenant.id && a.employeeId === employeeId)
          .sort((a, b) => b.clockInAt.localeCompare(a.clockInAt))
          .map((r) => recordView(state, r)),
      );
    }),
  ),

  /**
   * HR-003 clock in / out on a shared device: the employee's PIN says who (§5, §24). Any signed
   * in user at the location can hold the device; the PIN is what counts.
   */
  http.post(
    `${API}/staff/attendance/clock`,
    handle(async ({ request }) => {
      const ctx = staffContext(request, 'ATTENDANCE');
      const input = await parseBody(request, clockSchema);
      const locationId = input.locationId ?? ctx.me.currentLocation?.id;
      if (!locationId) throw new MockHttpError('VALIDATION_FAILED', 400, 'Choose a location');
      requireLocationAccess(ctx, locationId);
      const employee = employeeByPin(ctx, input.pin, locationId);
      const state = db.get();
      const open = state.attendance.find(
        (a) => a.tenantId === ctx.me.tenant.id && a.employeeId === employee.id && !a.clockOutAt,
      );
      const now = nowIso();
      let record: MockDb['attendance'][number];
      let action: ClockResponse['action'];
      if (open) {
        if (open.locationId !== locationId) {
          throw new MockHttpError(
            'CONFLICT',
            409,
            `Clocked in at ${locationName(open.locationId)}`,
            {
              reason: 'CLOCKED_IN_ELSEWHERE',
              locationId: open.locationId,
            },
          );
        }
        record = { ...open, clockOutAt: now };
        action = 'OUT';
        db.update((d) => {
          d.attendance = d.attendance.map((a) => (a.id === open.id ? record : a));
        });
      } else {
        record = {
          id: newId('att'),
          tenantId: ctx.me.tenant.id,
          employeeId: employee.id,
          locationId: locationId as AttendanceRecord['locationId'],
          date: localDate(),
          clockInAt: now,
          clockOutAt: null,
          method: 'PIN',
        };
        action = 'IN';
        db.update((d) => {
          d.attendance.push(record);
        });
      }
      const row = attendanceRow(db.get(), employee, locationId, record.date);
      recordAudit(ctx, {
        action: action === 'IN' ? 'staff.clock.in' : 'staff.clock.out',
        entity: 'employee',
        entityId: employee.id,
        entityLabel: `${employee.fullName} clocked ${action.toLowerCase()} · ${locationName(locationId)}${row.status === 'LATE' && action === 'IN' ? ` · ${row.lateBy} min late` : ''}`,
        before: null,
        after: { action },
      });
      const body: ClockResponse = {
        action,
        employee: { id: employee.id, fullName: employee.fullName },
        record: recordView(db.get(), record),
        shift: row.shift,
        lateBy: row.lateBy,
      };
      return HttpResponse.json(body);
    }),
  ),

  /** HR-004 roster */
  http.get(
    `${API}/staff/roster`,
    handle(({ request }) => {
      const ctx = staffContext(request, 'ATTENDANCE', 'staff.view');
      const url = new URL(request.url);
      const locationId = url.searchParams.get('locationId') ?? ctx.me.currentLocation?.id ?? '';
      requireLocationAccess(ctx, locationId);
      return HttpResponse.json(
        rosterWeek(ctx, locationId, url.searchParams.get('weekStart') ?? localDate()),
      );
    }),
  ),

  http.put(
    `${API}/staff/roster`,
    handle(async ({ request }) => {
      const ctx = staffContext(request, 'ATTENDANCE', 'staff.manage');
      const input = await parseBody(request, rosterAssignSchema);
      requireLocationAccess(ctx, input.locationId);
      const employee = findEmployee(ctx, input.employeeId);
      if (!employee.locationIds.includes(input.locationId as never)) {
        throw new MockHttpError('VALIDATION_FAILED', 400, "Doesn't work at this location", {
          fieldErrors: { employeeId: 'validation.required' },
        });
      }
      const template = input.templateId
        ? templatesOf(db.get(), ctx.me.tenant.id).find((t) => t.id === input.templateId)
        : null;
      if (input.templateId && !template) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'Unknown shift', {
          fieldErrors: { templateId: 'validation.required' },
        });
      }
      const same = (a: MockDb['rosterAssignments'][number]) =>
        a.tenantId === ctx.me.tenant.id &&
        a.employeeId === input.employeeId &&
        a.locationId === input.locationId &&
        a.date === input.date;
      db.update((d) => {
        d.rosterAssignments = d.rosterAssignments.filter((a) => !same(a));
        if (input.templateId) {
          d.rosterAssignments.push({
            id: newId('ros'),
            tenantId: ctx.me.tenant.id,
            locationId: input.locationId,
            employeeId: input.employeeId,
            date: input.date,
            templateId: input.templateId,
          });
        }
      });
      recordAudit(ctx, {
        action: 'staff.roster.assign',
        entity: 'employee',
        entityId: employee.id,
        entityLabel: `${employee.fullName} · ${input.date} · ${template?.name ?? 'off'}`,
        before: null,
        after: { templateId: input.templateId },
      });
      return HttpResponse.json(rosterWeek(ctx, input.locationId, input.date));
    }),
  ),

  /** HR-004 cash drawer shifts at a location, newest first. */
  http.get(
    `${API}/staff/cash-shifts`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'pos.drawer.open');
      const locationId =
        new URL(request.url).searchParams.get('locationId') ?? ctx.me.currentLocation?.id ?? '';
      requireLocationAccess(ctx, locationId);
      const state = db.get();
      return HttpResponse.json(
        state.cashShifts
          .filter((s) => s.tenantId === ctx.me.tenant.id && s.locationId === locationId)
          .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
          .map((s) => cashShiftView(state, s)),
      );
    }),
  ),

  http.get(
    `${API}/staff/cash-shifts/current`,
    handle(({ request }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'pos.drawer.open');
      const deviceId = ctx.me.device?.id;
      const state = db.get();
      const open = state.cashShifts.find(
        (s) => s.tenantId === ctx.me.tenant.id && s.deviceId === deviceId && s.status === 'OPEN',
      );
      return HttpResponse.json(open ? cashShiftView(state, open) : null);
    }),
  ),

  /** Open the drawer shift on this device with a float (SCN-005: after the last one closed). */
  http.post(
    `${API}/staff/cash-shifts`,
    handle(async ({ request }) => {
      const ctx = resolveContext(request, { requireLocation: true });
      requirePermission(ctx, 'pos.drawer.open');
      const device = tillDevice(ctx);
      const input = await parseBody(request, openCashShiftSchema);
      const locationId = ctx.me.currentLocation!.id;
      const employee = employeeByPin(ctx, input.pin, locationId);
      requireTillRights(ctx, employee);
      const state = db.get();
      if (
        state.cashShifts.some(
          (s) => s.tenantId === ctx.me.tenant.id && s.deviceId === device.id && s.status === 'OPEN',
        )
      ) {
        throw new MockHttpError('CONFLICT', 409, 'A shift is already open on this device', {
          reason: 'SHIFT_OPEN',
        });
      }
      const record: CashShiftRecord = {
        id: newId('sft'),
        tenantId: ctx.me.tenant.id,
        number: nextInventoryNumber(ctx, 'SFT'),
        locationId: locationId as CashShiftRecord['locationId'],
        deviceId: device.id,
        deviceName: device.name,
        status: 'OPEN',
        openedBy: { employeeId: employee.id, name: employee.fullName },
        openedAt: nowIso(),
        openingFloat: money(ctx, input.openingFloat),
        events: [],
      };
      db.update((d) => {
        d.cashShifts.push(record);
      });
      recordAudit(ctx, {
        action: 'staff.shift.open',
        entity: 'cash-shift',
        entityId: record.id,
        entityLabel: `${record.number} · ${device.name} · ${employee.fullName} · float ${input.openingFloat / 100}`,
        before: null,
        after: { openingFloat: record.openingFloat },
      });
      return HttpResponse.json(cashShiftView(db.get(), record), { status: 201 });
    }),
  ),

  http.post(
    `${API}/staff/cash-shifts/:id/events`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'pos.drawer.open');
      const shift = findCashShift(ctx, String(params.id));
      if (shift.status !== 'OPEN') {
        throw new MockHttpError('CONFLICT', 409, 'Shift is closed', { status: shift.status });
      }
      const input = await parseBody(request, cashShiftEventSchema);
      // Can't take out more cash than the drawer should hold.
      const expected = cashShiftView(db.get(), shift).expectedCash.amount;
      if (input.type === 'CASH_OUT' && input.amount > expected) {
        throw new MockHttpError('VALIDATION_FAILED', 400, 'More than is in the drawer', {
          reason: 'CASH_OUT_EXCEEDS_DRAWER',
          expectedCash: expected,
          fieldErrors: { amount: 'validation.moreThanInDrawer' },
        });
      }
      const record: CashShiftRecord = {
        ...shift,
        events: [
          ...shift.events,
          {
            id: newId('cse'),
            type: input.type,
            amount: money(ctx, input.amount),
            note: input.note,
            by: ctx.me.user.displayName,
            at: nowIso(),
          },
        ],
      };
      db.update((d) => {
        d.cashShifts = d.cashShifts.map((s) => (s.id === shift.id ? record : s));
      });
      recordAudit(ctx, {
        action: 'staff.shift.cash',
        entity: 'cash-shift',
        entityId: shift.id,
        entityLabel: `${shift.number} · ${input.type === 'CASH_IN' ? 'cash in' : 'cash out'} ${input.amount / 100} · ${input.note}`,
        before: null,
        after: { type: input.type, amount: input.amount },
      });
      return HttpResponse.json(cashShiftView(db.get(), record));
    }),
  ),

  /** Count the drawer and close (the next person opens with this count as their float). */
  http.post(
    `${API}/staff/cash-shifts/:id/close`,
    handle(async ({ request, params }) => {
      const ctx = resolveContext(request);
      requirePermission(ctx, 'pos.drawer.open');
      const shift = findCashShift(ctx, String(params.id));
      if (shift.status !== 'OPEN') {
        throw new MockHttpError('CONFLICT', 409, 'Shift is closed', { status: shift.status });
      }
      const input = await parseBody(request, closeCashShiftSchema);
      const employee = employeeByPin(ctx, input.pin, shift.locationId);
      requireTillRights(ctx, employee);
      const record: CashShiftRecord = {
        ...shift,
        status: 'CLOSED',
        closedBy: { employeeId: employee.id, name: employee.fullName },
        closedAt: nowIso(),
        countedCash: money(ctx, input.countedCash),
        ...(input.note ? { note: input.note } : {}),
      };
      db.update((d) => {
        d.cashShifts = d.cashShifts.map((s) => (s.id === shift.id ? record : s));
      });
      const view = cashShiftView(db.get(), record);
      recordAudit(ctx, {
        action: 'staff.shift.close',
        entity: 'cash-shift',
        entityId: shift.id,
        entityLabel: `${shift.number} closed by ${employee.fullName} · counted ${input.countedCash / 100}, expected ${view.expectedCash.amount / 100}`,
        before: { status: 'OPEN' },
        after: { status: 'CLOSED', variance: view.variance },
      });
      return HttpResponse.json(view);
    }),
  ),

  /** HR-005 */
  http.get(
    `${API}/staff/meals`,
    handle(({ request }) => {
      const ctx = staffContext(request, 'HR', 'staff.view');
      const url = new URL(request.url);
      const month = url.searchParams.get('month') ?? monthOf(nowIso());
      const employeeId = url.searchParams.get('employeeId');
      const locationId = url.searchParams.get('locationId');
      const mine = myLocationIds(ctx);
      return HttpResponse.json(
        db
          .get()
          .staffMeals.filter(
            (m) =>
              m.tenantId === ctx.me.tenant.id &&
              monthOf(m.at) === month &&
              (!employeeId || m.employeeId === employeeId) &&
              (locationId ? m.locationId === locationId : mine.includes(m.locationId)),
          )
          .sort((a, b) => b.at.localeCompare(a.at))
          .map(({ tenantId: _t, ...m }) => m),
      );
    }),
  ),

  /**
   * §22 staff meal: no payment, but the food leaves stock — recipe dishes use their ingredients,
   * other items post STAFF_MEAL. Valued at the location's sale price against the allowance (§23).
   */
  http.post(
    `${API}/staff/meals`,
    handle(async ({ request }) => {
      const ctx = mealContext(request);
      const input = await parseBody(request, staffMealSchema);
      const locationId = input.locationId ?? ctx.me.currentLocation!.id;
      requireLocationAccess(ctx, locationId);
      const employee = findEmployee(ctx, input.employeeId);
      if (!employee.isActive || !employee.locationIds.includes(locationId as never)) {
        throw new MockHttpError('VALIDATION_FAILED', 400, "Doesn't work at this location", {
          fieldErrors: { employeeId: 'validation.employeeRequired' },
        });
      }
      const state = db.get();
      const lines = input.lines.map((l, i) => {
        const product = state.products.find(
          (p) => p.id === l.productId && p.tenantId === ctx.me.tenant.id,
        );
        const row = state.locationProducts.find(
          (r) => r.locationId === locationId && r.productId === l.productId && r.enabled,
        );
        if (!product || !row) {
          throw new MockHttpError('VALIDATION_FAILED', 400, 'Not sold here', {
            fieldErrors: { [`lines.${i}.productId`]: 'validation.itemRequired' },
          });
        }
        const unitPrice = row.priceOverride ?? product.basePrice;
        return {
          productId: product.id,
          code: product.code,
          name: product.name,
          unit: product.stockUnit ?? ('pcs' as const),
          quantity: l.quantity,
          unitPrice,
          lineValue: { amount: unitPrice.amount * l.quantity, currency: unitPrice.currency },
        };
      });
      assertCanSell(ctx, locationId, lines);
      const verified = requireVerifiedAction(ctx, input.verification, 'staff.meal');
      const id = newId('sml');
      const number = nextInventoryNumber(ctx, 'SML');
      const meal: StaffMeal & { tenantId: string } = {
        id,
        tenantId: ctx.me.tenant.id,
        number,
        employeeId: employee.id,
        employeeName: employee.fullName,
        locationId: locationId as StaffMeal['locationId'],
        lines,
        value: money(
          ctx,
          lines.reduce((s, l) => s + l.lineValue.amount, 0),
        ),
        source: input.source ?? 'HR',
        approvedBy: verified.employee.fullName,
        reason: verified.reason,
        recordedBy: ctx.me.user.displayName,
        at: nowIso(),
        status: 'RECORDED',
      };
      postSaleStock(
        ctx,
        { id, number, locationId, lines },
        { type: 'STAFF_MEAL', kind: 'STAFF_MEAL' },
      );
      db.update((d) => {
        d.staffMeals.push(meal);
      });
      const month = monthOf(meal.at);
      const used = mealsValue(db.get(), ctx.me.tenant.id, employee.id, month);
      recordAudit(ctx, {
        action: 'staff.meal.create',
        entity: 'employee',
        entityId: employee.id,
        entityLabel: `${number} · ${employee.fullName} · ${lines.map((l) => `${l.name} ×${l.quantity}`).join(', ')} · ${meal.value.amount / 100} (${used / 100} this month)`,
        before: null,
        after: meal,
        verified,
      });
      const { tenantId: _t, ...pub } = meal;
      return HttpResponse.json(pub, { status: 201 });
    }),
  ),

  /**
   * A-312 void a staff meal: same day only (as POS-012), manager PIN + reason. Stock comes back;
   * the meal stays listed as VOIDED and stops counting against the allowance.
   */
  http.post(
    `${API}/staff/meals/:id/void`,
    handle(async ({ request, params }) => {
      const ctx = staffContext(request, 'HR', 'staff.view');
      const meal = db
        .get()
        .staffMeals.find((m) => m.id === String(params.id) && m.tenantId === ctx.me.tenant.id);
      if (!meal) throw new MockHttpError('NOT_FOUND', 404, 'Staff meal not found');
      requireLocationAccess(ctx, meal.locationId);
      if (meal.status === 'VOIDED') {
        throw new MockHttpError('CONFLICT', 409, 'This meal is already voided', {
          reason: 'ALREADY_VOIDED',
        });
      }
      if (localDate(meal.at) !== localDate()) {
        throw new MockHttpError('CONFLICT', 409, 'Only today’s staff meals can be voided', {
          reason: 'NOT_TODAY',
        });
      }
      const input = await parseBody(request, staffMealVoidSchema);
      const verified = requireVerifiedAction(ctx, input.verification, 'staff.meal.void');
      const { tenantId: _t, ...before } = meal;
      reverseMealStock(ctx, before, verified);
      const voided: StaffMeal = {
        ...before,
        status: 'VOIDED',
        voided: {
          at: nowIso(),
          by: ctx.me.user.displayName,
          approvedBy: verified.employee.fullName,
          reason: verified.reason,
        },
      };
      db.update((d) => {
        const rec = d.staffMeals.find((m) => m.id === meal.id);
        if (rec) Object.assign(rec, { status: voided.status, voided: voided.voided });
      });
      const used = mealsValue(db.get(), ctx.me.tenant.id, meal.employeeId, monthOf(meal.at));
      recordAudit(ctx, {
        action: 'staff.meal.void',
        entity: 'employee',
        entityId: meal.employeeId,
        entityLabel: `${meal.number} voided · ${meal.employeeName} · ${meal.value.amount / 100} back (${used / 100} this month)`,
        before: { status: 'RECORDED', value: meal.value },
        after: { status: 'VOIDED' },
        verified,
      });
      return HttpResponse.json(voided);
    }),
  ),

  /** HR-006 §23: allowance, eaten, remaining, excess for salary deduction. */
  http.get(
    `${API}/staff/allowance`,
    handle(({ request }) => {
      const ctx = staffContext(request, 'HR', 'staff.manage');
      const month = new URL(request.url).searchParams.get('month') ?? monthOf(nowIso());
      const state = db.get();
      const mine = myLocationIds(ctx);
      const rows = employeesOf(state, ctx.me.tenant.id)
        .filter((e) => e.isActive && e.locationIds.some((l) => mine.includes(l)))
        .map((e) => {
          const allowance = e.monthlyFoodAllowance?.amount ?? DEFAULT_ALLOWANCE;
          const consumed = mealsValue(state, e.tenantId, e.id, month);
          return {
            employeeId: e.id,
            code: e.code,
            employeeName: e.fullName,
            jobTitle: e.jobTitle,
            allowance: money(ctx, allowance),
            consumed: money(ctx, consumed),
            remaining: money(ctx, Math.max(0, allowance - consumed)),
            excess: money(ctx, Math.max(0, consumed - allowance)),
            meals: mealsOfMonth(state, e.tenantId, e.id, month).length,
          };
        })
        .sort((a, b) => b.excess.amount - a.excess.amount || b.consumed.amount - a.consumed.amount);
      const sum = (f: (r: (typeof rows)[number]) => number) =>
        money(
          ctx,
          rows.reduce((s, r) => s + f(r), 0),
        );
      const body: FoodAllowanceResponse = {
        month,
        rows,
        totals: {
          allowance: sum((r) => r.allowance.amount),
          consumed: sum((r) => r.consumed.amount),
          excess: sum((r) => r.excess.amount),
        },
      };
      return HttpResponse.json(body);
    }),
  ),
];
