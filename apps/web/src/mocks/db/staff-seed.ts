import type { StaffMeal, StaffMealLine, StockMovement } from '@rbp/types';
import type { CashShiftRecord, MockDb } from './seed';

/**
 * HR-* demo data for the pilot tenant:
 * - Phones and the Rs 5,000 monthly food allowance (§23) on every employee.
 * - Morning (06:00–14:00) / Evening (14:00–22:00) shifts, rostered Mon–Sat from 30 days ago to
 *   the end of this week; 30 days of clock-ins (Fathima late two days ago, Arun absent three
 *   days ago, a few more lates/absences earlier, Suresh in on two Sundays) and Kasun in now.
 * - Counter POS 1 cash shifts: a month of closed shifts (mostly exact, some over or short), then
 *   the last three as before — two closed (the second Rs 200 short) and one open — each opened
 *   with the previous count (SCN-005 handover).
 * - Staff meals: this month's (Arun just under his allowance, Kasun Rs 1,220 over) and some
 *   from earlier in the 30 days. They're on the ledger like sales (recipe dishes use
 *   ingredients); openings are topped up to match.
 */

const T1 = 'ten_01PILOT';
const MAIN = 'loc_01MAIN';
const BAKERY = 'loc_01BAKERY';
const MANAGER = 'Suresh Kumar';

const PHONES: Record<string, string> = {
  emp_01: '+94770000101',
  emp_02: '+94770000102',
  emp_03: '+94770000103',
  emp_04: '+94770000104',
  emp_05: '+94770000105',
  emp_06: '+94770000106',
  emp_09: '+94770000109',
  emp_10: '+94770000110',
};

/** Rostered staff: [employee, location, template]. */
const ROSTER: [string, string, 'tpl_MORNING' | 'tpl_EVENING'][] = [
  ['emp_03', MAIN, 'tpl_MORNING'],
  ['emp_05', MAIN, 'tpl_MORNING'],
  ['emp_04', MAIN, 'tpl_EVENING'],
  ['emp_02', MAIN, 'tpl_EVENING'],
  ['emp_10', MAIN, 'tpl_EVENING'],
  ['emp_06', BAKERY, 'tpl_MORNING'],
];

/** REP-007 history (A-295): days back that are late (minutes) or absent; all ≥ 7 days ago. */
const HISTORY_DAYS = 30;
const EXTRA_LATE: Record<string, [number, number][]> = {
  emp_03: [
    [9, 18],
    [17, 12],
  ],
  emp_04: [
    [12, 35],
    [20, 15],
    [26, 22],
  ],
  emp_10: [
    [8, 14],
    [15, 30],
  ],
  emp_06: [[22, 19]],
};
const EXTRA_ABSENT: Record<string, number[]> = {
  emp_05: [18],
  emp_10: [11],
  emp_04: [24],
};
/** Older staff meals: [days back, employee, [product, qty][]]. */
const OLD_MEALS: [number, string, [string, number][]][] = [
  [28, 'emp_05', [['prd_01R01', 1]]],
  [25, 'emp_04', [['prd_01K01', 1]]],
  [23, 'emp_03', [['prd_01D02', 1]]],
  [21, 'emp_05', [['prd_01R02', 1]]],
  [19, 'emp_10', [['prd_01R01', 1]]],
  [16, 'emp_04', [['prd_01R01', 1]]],
  [14, 'emp_05', [['prd_01K02', 1]]],
  [12, 'emp_03', [['prd_01R01', 1]]],
  [10, 'emp_04', [['prd_01K01', 1]]],
  [8, 'emp_10', [['prd_01D02', 1]]],
];
/** Drawer over/short per older shift (cents), cycled; mostly exact. */
const OLD_VARIANCE = [0, 0, -15_000, 0, 5_000, 0, 0, -10_000, 0, 20_000, 0, -50_000, 0, 0];

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayAt = (daysAgo: number, h: number, m = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d;
};

/** Staff meals this month: [employee, [product, qty][]]. */
const MEALS: [string, [string, number][]][] = [
  [
    'emp_05',
    [
      ['prd_01R01', 1],
      ['prd_01D02', 1],
    ],
  ],
  ['emp_04', [['prd_01R01', 1]]],
  [
    'emp_05',
    [
      ['prd_01R02', 1],
      ['prd_01D02', 1],
    ],
  ],
  [
    'emp_04',
    [
      ['prd_01K01', 1],
      ['prd_01D02', 1],
    ],
  ],
  [
    'emp_05',
    [
      ['prd_01R01', 1],
      ['prd_01D02', 1],
    ],
  ],
  [
    'emp_04',
    [
      ['prd_01R01', 1],
      ['prd_01K02', 1],
    ],
  ],
  [
    'emp_05',
    [
      ['prd_01R02', 1],
      ['prd_01D02', 1],
    ],
  ],
  [
    'emp_04',
    [
      ['prd_01R01', 1],
      ['prd_01K01', 1],
    ],
  ],
  ['emp_05', [['prd_01R01', 1]]],
  ['emp_04', [['prd_01R01', 1]]],
];

export function seedStaff(db: MockDb) {
  for (const e of db.employees.filter((x) => x.tenantId === T1)) {
    const phone = PHONES[e.id];
    if (phone) e.phone = phone;
    e.monthlyFoodAllowance = { amount: 500_000, currency: 'LKR' };
    e.joinedAt = localDate(dayAt(400 - Number(e.id.slice(4)) * 20, 9));
  }

  db.shiftTemplates.push(
    { id: 'tpl_MORNING', tenantId: T1, name: 'Morning', start: '06:00', end: '14:00' },
    { id: 'tpl_EVENING', tenantId: T1, name: 'Evening', start: '14:00', end: '22:00' },
  );
  const window = { tpl_MORNING: [6, 14], tpl_EVENING: [14, 22] } as const;

  // Roster: 30 days ago (or Monday last week if earlier) → Sunday this week, Mon–Sat.
  const today = new Date();
  const mondayThisWeek = (today.getDay() + 6) % 7;
  let r = 0;
  for (let back = Math.max(HISTORY_DAYS, mondayThisWeek + 7); back >= mondayThisWeek - 6; back--) {
    const day = dayAt(back, 12);
    if (day.getDay() === 0) continue;
    for (const [employeeId, locationId, templateId] of ROSTER) {
      db.rosterAssignments.push({
        id: `ros_seed_${++r}`,
        tenantId: T1,
        locationId,
        employeeId,
        date: localDate(day),
        templateId,
      });
    }
  }

  // Attendance: 30 days as rostered (lates and absences), Suresh on two Sundays, Kasun in now.
  let a = 0;
  for (let back = HISTORY_DAYS; back >= 1; back--) {
    const date = localDate(dayAt(back, 12));
    for (const [employeeId, locationId, templateId] of ROSTER) {
      if (!db.rosterAssignments.some((x) => x.employeeId === employeeId && x.date === date)) {
        continue;
      }
      if (employeeId === 'emp_05' && back === 3) continue; // absent
      if (EXTRA_ABSENT[employeeId]?.includes(back)) continue;
      const [start, end] = window[templateId];
      const extraLate = EXTRA_LATE[employeeId]?.find(([d]) => d === back)?.[1];
      const lateBy = employeeId === 'emp_03' && back === 2 ? 25 : (extraLate ?? -(4 + (a % 6)));
      const clockIn = dayAt(back, start, 0);
      clockIn.setMinutes(clockIn.getMinutes() + lateBy);
      const clockOut = dayAt(back, end, 3 + (a % 7));
      db.attendance.push({
        id: `att_seed_${++a}`,
        tenantId: T1,
        employeeId,
        locationId: locationId as never,
        date,
        clockInAt: clockIn.toISOString(),
        clockOutAt: clockOut.toISOString(),
        method: 'PIN',
      });
    }
  }
  // Unrostered: Suresh covers a Sunday morning now and then.
  let sundays = 0;
  for (let back = HISTORY_DAYS; back >= 7 && sundays < 2; back--) {
    if (dayAt(back, 12).getDay() !== 0) continue;
    sundays += 1;
    db.attendance.push({
      id: `att_seed_${++a}`,
      tenantId: T1,
      employeeId: 'emp_02',
      locationId: MAIN as never,
      date: localDate(dayAt(back, 12)),
      clockInAt: dayAt(back, 9, 55).toISOString(),
      clockOutAt: dayAt(back, 14, 5).toISOString(),
      method: 'PIN',
    });
  }
  const kasunIn = new Date(Date.now() - 90 * 60_000);
  db.attendance.push({
    id: `att_seed_${a + 1}`,
    tenantId: T1,
    employeeId: 'emp_04',
    locationId: MAIN as never,
    date: localDate(kasunIn),
    clockInAt: kasunIn.toISOString(),
    clockOutAt: null,
    method: 'PIN',
  });

  // Cash shifts on Counter POS 1: handover chain 5,000 → 3,500 → 3,300.
  const shift = (
    n: number,
    opened: Date,
    by: [string, string],
    float: number,
    close?: { at: Date; by: [string, string]; counted: number },
    cashOut?: number,
  ): CashShiftRecord => ({
    id: `sft_seed_${n}`,
    tenantId: T1,
    number: `SFT-${String(n).padStart(6, '0')}`,
    locationId: MAIN as never,
    deviceId: 'dev_01',
    deviceName: 'Counter POS 1',
    status: close ? 'CLOSED' : 'OPEN',
    openedBy: { employeeId: by[0], name: by[1] },
    openedAt: opened.toISOString(),
    openingFloat: { amount: float, currency: 'LKR' },
    events: cashOut
      ? [
          {
            id: `cse_seed_${n}`,
            type: 'CASH_OUT',
            amount: { amount: cashOut, currency: 'LKR' },
            note: 'Paid the vegetable supplier',
            by: by[1],
            at: new Date(opened.getTime() + 3 * 3_600_000).toISOString(),
          },
        ]
      : [],
    ...(close
      ? {
          closedBy: { employeeId: close.by[0], name: close.by[1] },
          closedAt: close.at.toISOString(),
          countedCash: { amount: close.counted, currency: 'LKR' },
        }
      : {}),
  });
  const fathima: [string, string] = ['emp_03', 'Fathima Rizvi'];
  const suresh: [string, string] = ['emp_02', MANAGER];
  const kasun: [string, string] = ['emp_04', 'Kasun Perera'];
  // Older shifts (Mon–Sat, 30 → 3 days ago), chained backwards so the last hands over 5,000.
  // History sales have no device, so expected cash is the float and counted = float + variance.
  const oldDays: number[] = [];
  for (let back = HISTORY_DAYS; back >= 3; back--) {
    if (dayAt(back, 12).getDay() !== 0) oldDays.push(back);
  }
  const old: { back: number; float: number; counted: number }[] = [];
  let handover = 500_000;
  for (let i = oldDays.length - 1; i >= 0; i--) {
    const variance = OLD_VARIANCE[i % OLD_VARIANCE.length]!;
    old.unshift({ back: oldDays[i]!, float: handover - variance, counted: handover });
    handover -= variance;
  }
  const n0 = old.length;
  const openToday = new Date(Math.min(dayAt(0, 6).getTime(), Date.now() - 60 * 60_000));
  db.cashShifts.push(
    ...old.map((o, i) =>
      shift(i + 1, dayAt(o.back, 6), i % 5 === 4 ? kasun : fathima, o.float, {
        at: dayAt(o.back, 22),
        by: i % 4 === 3 ? kasun : suresh,
        counted: o.counted,
      }),
    ),
    shift(
      n0 + 1,
      dayAt(2, 6),
      fathima,
      500_000,
      { at: dayAt(2, 22), by: suresh, counted: 350_000 },
      150_000,
    ),
    shift(n0 + 2, dayAt(1, 6), fathima, 350_000, {
      at: dayAt(1, 22),
      by: suresh,
      counted: 330_000,
    }),
    shift(n0 + 3, openToday, fathima, 330_000),
  );
  db.orderSequences[`SFT:${T1}`] = n0 + 3;

  // Staff meals this month, spread over the days so far.
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1, 12, 30);
  const daysSoFar = today.getDate() - 1;
  const movements: (StockMovement & { tenantId: string })[] = [];
  const touched = new Set<string>();
  let mv = 0;
  // Earlier meals stay before this month so the HR-005/006 allowance figures don't move.
  const planned: { employeeId: string; items: [string, number][]; at: string }[] = [
    ...OLD_MEALS.map(([back, employeeId, items]) => ({
      employeeId,
      items,
      at: dayAt(back, 13, 15),
    }))
      .filter((m) => m.at < monthStart)
      .map((m) => ({ ...m, at: m.at.toISOString() })),
    ...MEALS.map(([employeeId, items], i) => {
      let when = new Date(monthStart);
      when.setDate(1 + Math.floor((i * daysSoFar) / MEALS.length));
      if (when.getTime() > Date.now()) when = new Date(Date.now() - (MEALS.length - i) * 60_000);
      return { employeeId, items, at: when.toISOString() };
    }),
  ];
  planned.forEach(({ employeeId, items, at }, i) => {
    const employee = db.employees.find((e) => e.id === employeeId)!;
    const number = `SML-${String(i + 1).padStart(6, '0')}`;
    const id = `sml_seed_${i + 1}`;
    const lines: StaffMealLine[] = items.map(([productId, quantity]) => {
      const p = db.products.find((x) => x.id === productId)!;
      const row = db.locationProducts.find(
        (x) => x.locationId === MAIN && x.productId === productId,
      );
      const unitPrice = row?.priceOverride ?? p.basePrice;
      return {
        productId,
        code: p.code,
        name: p.name,
        unit: p.stockUnit ?? 'pcs',
        quantity,
        unitPrice,
        lineValue: { amount: unitPrice.amount * quantity, currency: unitPrice.currency },
      };
    });
    const meal: StaffMeal & { tenantId: string } = {
      id,
      tenantId: T1,
      number,
      employeeId,
      employeeName: employee.fullName,
      locationId: MAIN as never,
      lines,
      value: { amount: lines.reduce((s, l) => s + l.lineValue.amount, 0), currency: 'LKR' },
      source: i % 3 === 0 ? 'HR' : 'POS',
      approvedBy: MANAGER,
      reason: { code: 'MEAL_BREAK', label: 'Meal on shift' },
      recordedBy: i % 3 === 0 ? MANAGER : 'Fathima Rizvi',
      at,
      status: 'RECORDED',
    };
    db.staffMeals.push(meal);
    const reference = { kind: 'STAFF_MEAL' as const, id, number };
    for (const l of lines) {
      const recipe = db.recipes.find((x) => x.productId === l.productId && x.isActive);
      const parts = recipe
        ? recipe.lines.map((x) => [x.ingredientId, x.quantity * l.quantity] as const)
        : [[l.productId, l.quantity] as const];
      for (const [productId, quantity] of parts) {
        const p = db.products.find((x) => x.id === productId)!;
        touched.add(productId);
        movements.push({
          id: `stm_sml_${++mv}`,
          tenantId: T1,
          productId,
          productName: p.name,
          productCode: p.code,
          unit: p.stockUnit ?? 'pcs',
          locationId: MAIN as never,
          type: 'STAFF_MEAL',
          quantity: -quantity,
          balanceAfter: 0,
          reference,
          note: `${employee.fullName} · ${l.name} ×${l.quantity}`,
          createdBy: meal.recordedBy,
          at,
        });
      }
    }
  });
  db.stockMovements.push(...movements);
  topUpOpenings(db, movements, MAIN, touched);
  db.orderSequences[`SML:${T1}`] = planned.length;
}

/** Keep INV-* balances where they were: add what these movements took to the openings. */
function topUpOpenings(
  db: MockDb,
  movements: StockMovement[],
  locationId: string,
  products: Set<string>,
) {
  const used = new Map<string, number>();
  for (const m of movements) used.set(m.productId, (used.get(m.productId) ?? 0) - m.quantity);
  for (const [productId, qty] of used) {
    const open = db.stockMovements.find(
      (m) =>
        m.tenantId === T1 &&
        m.type === 'OPENING' &&
        m.productId === productId &&
        m.locationId === locationId,
    );
    if (open) open.quantity += qty;
  }
  db.stockMovements.sort((a, b) => a.at.localeCompare(b.at));
  const balances = new Map<string, number>();
  for (const m of db.stockMovements) {
    if (m.tenantId !== T1 || m.locationId !== locationId || !products.has(m.productId)) continue;
    const b = (balances.get(m.productId) ?? 0) + m.quantity;
    balances.set(m.productId, b);
    m.balanceAfter = b;
  }
}
