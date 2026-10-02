import type {
  BusinessSettings,
  Device,
  FeatureSettings,
  LanguageCode,
  LanguageSettings,
  PaymentMethodSetting,
  PrinterSettings,
  SettingsDevice,
  SettingsStation,
} from '@rbp/types';
import { FEATURE_CODES } from '@rbp/types';
import { newId } from '@rbp/utils';
import {
  businessSchema,
  deviceSchema,
  languageSettingsSchema,
  paymentSettingsSchema,
  printerNameSchema,
  stationSchema,
} from '@rbp/validation';
import { http, HttpResponse } from 'msw';
import { recordAudit } from '../audit';
import type { MockContext } from '../context';
import { db } from '../db';
import type { MockKitchenStationRecord } from '../db/catalog-seed';
import { API, handle, MockHttpError, parseBody } from '../http';
import { paymentMethodsFor } from '../payments';
import {
  activeLocations,
  activeUsers,
  admin,
  checkLimit,
  conflict,
  fieldConflict,
  posRow,
  tenantLocation,
} from './settings';

/** SET-001/005/006/008/009/010 — same rules as settings.ts: settings.manage, tenant-wide, audited. */

// ── SET-001 Business ──────────────────────────────────────────────────────────

function business(ctx: MockContext): BusinessSettings {
  const t = db.get().tenants.find((x) => x.id === ctx.me.tenant.id)!;
  return {
    name: t.name,
    logoText: t.branding.logoText,
    primaryColor: t.branding.primaryColor ?? null,
    phone: t.phone ?? '',
    taxRegNo: t.taxRegNo ?? '',
    timezone: t.timezone,
    currency: t.currency,
  };
}

// ── SET-005 Devices ───────────────────────────────────────────────────────────

const newCode = () => String(Math.floor(Math.random() * 900000) + 100000);

function deviceView(device: Device): SettingsDevice {
  const state = db.get();
  const activation = state.deviceActivation[device.id];
  return {
    ...device,
    locationName: state.locations.find((l) => l.id === device.locationId)?.name ?? '',
    activationCode: activation?.code ?? '',
    paired: activation?.paired ?? false,
  };
}

function deviceOr404(ctx: MockContext, id: string): Device {
  const device = db.get().devices.find((d) => d.id === id && d.tenantId === ctx.me.tenant.id);
  if (!device) throw new MockHttpError('NOT_FOUND', 404, 'Device not found');
  return device;
}

const activeDevices = (ctx: MockContext) =>
  db.get().devices.filter((d) => d.tenantId === ctx.me.tenant.id && d.isActive);

/** A device with an open cash drawer shift stays put until the shift is closed (A-283). */
function requireNoOpenShift(device: Device) {
  const open = db.get().cashShifts.some((s) => s.deviceId === device.id && s.status === 'OPEN');
  if (open) throw conflict(`${device.name} has an open cash drawer shift`, 'DEVICE_SHIFT_OPEN');
}

// ── SET-008 Printers ──────────────────────────────────────────────────────────

function stationView(station: MockKitchenStationRecord): SettingsStation {
  const { tenantId: _, ...rest } = station;
  return {
    ...rest,
    productCount: db
      .get()
      .locationProducts.filter(
        (r) => r.locationId === station.locationId && r.stationId === station.id,
      ).length,
  };
}

function printers(ctx: MockContext, locationId: string): PrinterSettings {
  const state = db.get();
  return {
    locationId: locationId as PrinterSettings['locationId'],
    receiptPrinter:
      state.posSettings.find((s) => s.locationId === locationId)?.receiptPrinter ??
      'Receipt Printer',
    stations: state.kitchenStations
      .filter((s) => s.tenantId === ctx.me.tenant.id && s.locationId === locationId)
      .map(stationView),
  };
}

function stationOr404(ctx: MockContext, id: string): MockKitchenStationRecord {
  const station = db
    .get()
    .kitchenStations.find((s) => s.id === id && s.tenantId === ctx.me.tenant.id);
  if (!station) throw new MockHttpError('NOT_FOUND', 404, 'Station not found');
  return station;
}

function requireUniqueStationCode(locationId: string, code: string, exceptId?: string) {
  const taken = db
    .get()
    .kitchenStations.some(
      (s) =>
        s.locationId === locationId &&
        s.id !== exceptId &&
        s.code.toLowerCase() === code.toLowerCase(),
    );
  if (taken) throw fieldConflict('Station code already used', { code: 'validation.codeTaken' });
}

// ── SET-009 Languages ─────────────────────────────────────────────────────────

function languages(ctx: MockContext): LanguageSettings {
  const state = db.get();
  const t = state.tenants.find((x) => x.id === ctx.me.tenant.id)!;
  const products = state.products.filter((p) => p.tenantId === t.id && p.isActive);
  const categories = state.categories.filter((c) => c.tenantId === t.id && c.isActive);
  const has = (names: { nameTranslations?: Partial<Record<string, string>> }, l: LanguageCode) =>
    !!names.nameTranslations?.[l]?.trim();
  return {
    defaultLanguage: t.defaultLanguage,
    languages: t.languages,
    coverage: (['ta', 'si'] as const).map((language) => ({
      language,
      products: products.length,
      productsTranslated: products.filter((p) => has(p, language)).length,
      categories: categories.length,
      categoriesTranslated: categories.filter((c) => has(c, language)).length,
    })),
  };
}

export const settingsSystemHandlers = [
  // ── SET-001 ──
  http.get(
    `${API}/settings/business`,
    handle(({ request }) => HttpResponse.json<BusinessSettings>(business(admin(request)))),
  ),
  http.put(
    `${API}/settings/business`,
    handle(async ({ request }) => {
      const ctx = admin(request);
      const body = await parseBody(request, businessSchema);
      const before = business(ctx);
      db.update((d) => {
        const t = d.tenants.find((x) => x.id === ctx.me.tenant.id)!;
        t.name = body.name;
        t.timezone = body.timezone;
        t.branding = {
          logoText: body.logoText.toUpperCase(),
          ...(body.primaryColor ? { primaryColor: body.primaryColor } : {}),
        };
        if (body.phone) t.phone = body.phone;
        else delete t.phone;
        if (body.taxRegNo) t.taxRegNo = body.taxRegNo;
        else delete t.taxRegNo;
      });
      const after = business(ctx);
      recordAudit(ctx, {
        action: 'settings.business.update',
        entity: 'tenant',
        entityId: ctx.me.tenant.id,
        entityLabel: after.name,
        before,
        after,
      });
      return HttpResponse.json<BusinessSettings>(after);
    }),
  ),

  // ── SET-005 ──
  http.get(
    `${API}/settings/devices`,
    handle(({ request }) => {
      const ctx = admin(request);
      return HttpResponse.json<SettingsDevice[]>(
        db
          .get()
          .devices.filter((d) => d.tenantId === ctx.me.tenant.id)
          .map(deviceView),
      );
    }),
  ),
  http.post(
    `${API}/settings/devices`,
    handle(async ({ request }) => {
      const ctx = admin(request);
      const body = await parseBody(request, deviceSchema);
      tenantLocation(ctx, body.locationId);
      const isActive = body.isActive ?? true;
      if (isActive) checkLimit(ctx, 'devices', activeDevices(ctx).length);
      const device: Device = {
        id: newId('dev') as Device['id'],
        tenantId: ctx.me.tenant.id,
        locationId: body.locationId as Device['locationId'],
        name: body.name,
        type: body.type,
        isActive,
      };
      db.update((d) => {
        d.devices.push(device);
        d.deviceActivation[device.id] = { code: newCode(), paired: false };
      });
      const view = deviceView(device);
      const { activationCode: _, ...audited } = view;
      recordAudit(ctx, {
        action: 'settings.device.create',
        entity: 'device',
        entityId: device.id,
        entityLabel: device.name,
        before: null,
        after: audited,
      });
      return HttpResponse.json<SettingsDevice>(view, { status: 201 });
    }),
  ),
  http.put(
    `${API}/settings/devices/:id`,
    handle(async ({ request, params }) => {
      const ctx = admin(request);
      const device = deviceOr404(ctx, String(params.id));
      const body = await parseBody(request, deviceSchema);
      tenantLocation(ctx, body.locationId);
      const isActive = body.isActive ?? device.isActive;
      if (body.locationId !== device.locationId || (device.isActive && !isActive)) {
        requireNoOpenShift(device);
      }
      if (!device.isActive && isActive) checkLimit(ctx, 'devices', activeDevices(ctx).length);
      const next: Device = {
        ...device,
        name: body.name,
        type: body.type,
        locationId: body.locationId as Device['locationId'],
        isActive,
      };
      db.update((d) => {
        d.devices[d.devices.findIndex((x) => x.id === device.id)] = next;
      });
      recordAudit(ctx, {
        action: 'settings.device.update',
        entity: 'device',
        entityId: device.id,
        entityLabel: next.name,
        before: device,
        after: next,
      });
      return HttpResponse.json<SettingsDevice>(deviceView(next));
    }),
  ),
  http.post(
    `${API}/settings/devices/:id/code`,
    handle(({ request, params }) => {
      const ctx = admin(request);
      const device = deviceOr404(ctx, String(params.id));
      db.update((d) => {
        d.deviceActivation[device.id] = { code: newCode(), paired: false };
      });
      recordAudit(ctx, {
        action: 'settings.device.code',
        entity: 'device',
        entityId: device.id,
        entityLabel: device.name,
        before: null,
        after: null,
      });
      return HttpResponse.json<SettingsDevice>(deviceView(device));
    }),
  ),

  // ── SET-006 ──
  http.get(
    `${API}/settings/payments`,
    handle(({ request }) => {
      const ctx = admin(request);
      return HttpResponse.json<PaymentMethodSetting[]>(paymentMethodsFor(ctx.me.tenant.id));
    }),
  ),
  http.put(
    `${API}/settings/payments`,
    handle(async ({ request }) => {
      const ctx = admin(request);
      const body = await parseBody(request, paymentSettingsSchema);
      const before = paymentMethodsFor(ctx.me.tenant.id);
      db.update((d) => {
        d.paymentMethods[ctx.me.tenant.id] = before.map((m) => ({
          method: m.method,
          // Cash can't be turned off: every till needs it.
          enabled:
            m.method === 'CASH' ||
            (body.methods.find((x) => x.method === m.method)?.enabled ?? m.enabled),
        }));
      });
      const after = paymentMethodsFor(ctx.me.tenant.id);
      recordAudit(ctx, {
        action: 'settings.payments.update',
        entity: 'tenant',
        entityId: ctx.me.tenant.id,
        entityLabel: 'Payment methods',
        before,
        after,
      });
      return HttpResponse.json<PaymentMethodSetting[]>(after);
    }),
  ),

  // ── SET-008 ──
  http.get(
    `${API}/settings/printers`,
    handle(({ request }) => {
      const ctx = admin(request);
      const id = new URL(request.url).searchParams.get('locationId') ?? ctx.me.currentLocation?.id;
      const location = tenantLocation(ctx, id ?? '');
      return HttpResponse.json<PrinterSettings>(printers(ctx, location.id));
    }),
  ),
  http.put(
    `${API}/settings/printers/:locationId`,
    handle(async ({ request, params }) => {
      const ctx = admin(request);
      const location = tenantLocation(ctx, String(params.locationId));
      const { receiptPrinter } = await parseBody(request, printerNameSchema);
      const before = printers(ctx, location.id).receiptPrinter;
      db.update((d) => {
        posRow(d, location.id).receiptPrinter = receiptPrinter;
      });
      recordAudit(ctx, {
        action: 'settings.printer.update',
        entity: 'location',
        entityId: location.id,
        entityLabel: location.name,
        before: { receiptPrinter: before },
        after: { receiptPrinter },
      });
      return HttpResponse.json<PrinterSettings>(printers(ctx, location.id));
    }),
  ),
  http.post(
    `${API}/settings/stations`,
    handle(async ({ request }) => {
      const ctx = admin(request);
      const body = await parseBody(request, stationSchema);
      const location = tenantLocation(ctx, body.locationId);
      requireUniqueStationCode(location.id, body.code);
      const station: MockKitchenStationRecord = {
        id: newId('st'),
        tenantId: ctx.me.tenant.id,
        locationId: location.id,
        code: body.code,
        name: body.name,
        printerName: body.printerName,
      };
      db.update((d) => {
        d.kitchenStations.push(station);
      });
      const view = stationView(station);
      recordAudit(ctx, {
        action: 'settings.station.create',
        entity: 'station',
        entityId: station.id,
        entityLabel: `${station.name} · ${location.name}`,
        before: null,
        after: view,
      });
      return HttpResponse.json<SettingsStation>(view, { status: 201 });
    }),
  ),
  http.put(
    `${API}/settings/stations/:id`,
    handle(async ({ request, params }) => {
      const ctx = admin(request);
      const station = stationOr404(ctx, String(params.id));
      const body = await parseBody(request, stationSchema);
      requireUniqueStationCode(station.locationId, body.code, station.id);
      // A station belongs to its location; make a new one elsewhere instead of moving it.
      const next = { ...station, code: body.code, name: body.name, printerName: body.printerName };
      db.update((d) => {
        d.kitchenStations[d.kitchenStations.findIndex((s) => s.id === station.id)] = next;
      });
      recordAudit(ctx, {
        action: 'settings.station.update',
        entity: 'station',
        entityId: station.id,
        entityLabel: next.name,
        before: stationView(station),
        after: stationView(next),
      });
      return HttpResponse.json<SettingsStation>(stationView(next));
    }),
  ),
  http.delete(
    `${API}/settings/stations/:id`,
    handle(({ request, params }) => {
      const ctx = admin(request);
      const station = stationOr404(ctx, String(params.id));
      const { productCount } = stationView(station);
      if (productCount > 0) {
        throw conflict(`${productCount} products still print here`, 'STATION_IN_USE', {
          count: productCount,
        });
      }
      db.update((d) => {
        d.kitchenStations = d.kitchenStations.filter((s) => s.id !== station.id);
      });
      recordAudit(ctx, {
        action: 'settings.station.delete',
        entity: 'station',
        entityId: station.id,
        entityLabel: station.name,
        before: stationView(station),
        after: null,
      });
      return new HttpResponse(null, { status: 204 });
    }),
  ),

  // ── SET-009 ──
  http.get(
    `${API}/settings/languages`,
    handle(({ request }) => HttpResponse.json<LanguageSettings>(languages(admin(request)))),
  ),
  http.put(
    `${API}/settings/languages`,
    handle(async ({ request }) => {
      const ctx = admin(request);
      const body = await parseBody(request, languageSettingsSchema);
      const before = languages(ctx);
      db.update((d) => {
        const t = d.tenants.find((x) => x.id === ctx.me.tenant.id)!;
        t.languages = body.languages;
        t.defaultLanguage = body.defaultLanguage;
      });
      recordAudit(ctx, {
        action: 'settings.languages.update',
        entity: 'tenant',
        entityId: ctx.me.tenant.id,
        entityLabel: 'Languages',
        before: { defaultLanguage: before.defaultLanguage, languages: before.languages },
        after: body,
      });
      return HttpResponse.json<LanguageSettings>(languages(ctx));
    }),
  ),

  // ── SET-010 (read-only) ──
  http.get(
    `${API}/settings/features`,
    handle(({ request }) => {
      const ctx = admin(request);
      const state = db.get();
      const enabled = new Set(state.features[ctx.me.tenant.id] ?? []);
      const limits = state.limits[ctx.me.tenant.id] ?? {};
      return HttpResponse.json<FeatureSettings>({
        status: ctx.me.tenant.status,
        features: FEATURE_CODES.map((code) => ({ code, enabled: enabled.has(code) })),
        limits: [
          { code: 'locations', used: activeLocations(ctx).length, max: limits.locations ?? null },
          { code: 'devices', used: activeDevices(ctx).length, max: limits.devices ?? null },
          { code: 'users', used: activeUsers(ctx).length, max: limits.users ?? null },
        ],
      });
    }),
  ),
];
