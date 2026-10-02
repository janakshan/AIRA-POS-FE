import { useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Switch,
  toast,
} from '@rbp/ui';
import { FlaskConicalIcon, PaletteIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { type ReactNode, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useMe, useSwitchLocation } from '@/features/auth/api/queries';
import { type FailureMode, mockConfig, SCENARIOS, type ScenarioId } from '@/mocks/config';
import { useSessionStore } from '@/stores/session-store';
import { useUiStore } from '@/stores/ui-store';
import { devApi } from '../api/dev-api';
import { useDevDevices, useDevMembers, useDevTenants } from '../api/queries';
import { applyScenario } from '../lib/scenarios';

const NO_DEVICE = '__none__';
const LATENCIES = [0, 300, 1000, 3000];

function useMockConfig() {
  return useSyncExternalStore(mockConfig.subscribe, mockConfig.getState);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

/** Floating prototype-only panel: tenant/role/location/device switcher + mock network controls. */
export function DevToolsPanel() {
  const { t } = useTranslation('devtools');
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const config = useMockConfig();
  const { data: me } = useMe();
  const signIn = useSessionStore((s) => s.signIn);
  const signOut = useSessionStore((s) => s.signOut);
  const setLocation = useSessionStore((s) => s.setLocation);
  const deviceId = useSessionStore((s) => s.deviceId);
  const setDevice = useSessionStore((s) => s.setDevice);
  const switchLocation = useSwitchLocation();
  const showScreenIds = useUiStore((s) => s.showScreenIds);
  const setShowScreenIds = useUiStore((s) => s.setShowScreenIds);
  const showQueryDevtools = useUiStore((s) => s.showQueryDevtools);
  const setShowQueryDevtools = useUiStore((s) => s.setShowQueryDevtools);

  const [tenantId, setTenantId] = useState<string | undefined>(undefined);
  const [applying, setApplying] = useState(false);
  const activeTenantId = tenantId ?? me?.tenant.id;

  const tenants = useDevTenants(open);
  const members = useDevMembers(activeTenantId, open);
  const devices = useDevDevices(me?.tenant.id, open);
  const locationDevices =
    devices.data?.filter((d) => d.locationId === me?.currentLocation?.id) ?? [];

  async function impersonate(tenantUserId: string) {
    const result = await devApi.impersonate(tenantUserId);
    queryClient.clear();
    signIn(result.accessToken);
    const current = useSessionStore.getState().locationId;
    if (!current || !result.locationIds.includes(current)) {
      setLocation(result.locationIds.length === 1 ? (result.locationIds[0] ?? null) : null);
      setDevice(null);
    }
    setTenantId(undefined);
    toast.success(
      t('switched', {
        name: result.member.displayName,
        role: result.member.roleName,
        tenant: tenants.data?.find((x) => x.id === activeTenantId)?.name ?? '',
      }),
    );
    navigate('/', { replace: true });
  }

  async function reset() {
    await devApi.reset();
    queryClient.clear();
    signOut();
    setOpen(false);
    toast.info(t('resetConfirm'));
    navigate('/login', { replace: true });
  }

  async function runScenario(id: ScenarioId) {
    config.set({ scenario: id });
    setApplying(true);
    // Leave the current screen first: the new role may not be allowed its data (403 noise).
    navigate('/', { replace: true });
    try {
      const path = await applyScenario(id, queryClient);
      setTenantId(undefined);
      setOpen(false);
      navigate(path, { replace: true });
      toast.info(t('scenarioApplied', { id, name: SCENARIOS.find((s) => s.id === id)?.name }), {
        description: t(`scenarios.${id}`),
        duration: 10_000,
      });
    } catch {
      toast.error(t('scenarioFailed', { id }));
    } finally {
      setApplying(false);
    }
  }

  const currentMember = members.data?.find((m) => m.tenantUserId === me?.tenantUser.id);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('open')}
        title={t('open')}
        // Slim edge tab: stays out of the way of POS totals/pay buttons.
        className="fixed top-1/2 right-0 z-40 flex min-h-12 w-6 -translate-y-1/2 flex-col items-center justify-center gap-1.5 rounded-l-md bg-amber-400 py-3 text-black opacity-80 shadow-lg ring-1 ring-black/10 transition after:absolute after:inset-y-0 after:right-0 after:-left-5 after:content-[''] hover:opacity-100 focus-visible:opacity-100 print:hidden"
      >
        <FlaskConicalIcon className="size-3.5" />
        {config.failure !== 'none' && <span className="size-2 rounded-full bg-red-600" />}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-sm">
          <SheetHeader className="border-b">
            <SheetTitle className="flex items-center gap-2">
              <FlaskConicalIcon className="size-4 text-amber-500" /> {t('title')}
            </SheetTitle>
            <SheetDescription>{t('subtitle')}</SheetDescription>
          </SheetHeader>

          <div className="space-y-6 p-4">
            {me && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold">{t('context')}</h3>
                <Field label={t('tenant')}>
                  <Select value={activeTenantId} onValueChange={setTenantId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.data?.map((x) => (
                        <SelectItem key={x.id} value={x.id}>
                          {x.code} · {x.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('signInAs')}>
                  <Select
                    // Always controlled: '' shows the placeholder until the member list loads.
                    value={
                      (activeTenantId === me.tenant.id ? currentMember?.tenantUserId : '') ?? ''
                    }
                    onValueChange={(v) => void impersonate(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.data?.map((m) => (
                        <SelectItem key={m.tenantUserId} value={m.tenantUserId}>
                          {m.roleName} — {m.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('location')}>
                  <Select value={me.currentLocation?.id ?? ''} onValueChange={switchLocation}>
                    <SelectTrigger>
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {me.locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('device')}>
                  <Select
                    value={deviceId ?? NO_DEVICE}
                    onValueChange={(v) => setDevice(v === NO_DEVICE ? null : v)}
                    disabled={!me.currentLocation}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_DEVICE}>{t('noDevice')}</SelectItem>
                      {locationDevices.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </section>
            )}

            <Separator />

            <section className="space-y-3">
              <Field label={t('scenario')}>
                <Select
                  value={config.scenario}
                  disabled={applying}
                  onValueChange={(v) => void runScenario(v as ScenarioId)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SCENARIOS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.id} · {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <p className="text-xs text-muted-foreground">{t(`scenarios.${config.scenario}`)}</p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={applying}
                onClick={() => void runScenario(config.scenario)}
              >
                <PlayIcon /> {applying ? t('scenarioApplying') : t('scenarioApply')}
              </Button>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t('network')}</h3>
              <Field label={`${t('latency')} (${config.latencyMs} ms)`}>
                <div className="grid grid-cols-4 gap-1">
                  {LATENCIES.map((ms) => (
                    <Button
                      key={ms}
                      size="sm"
                      variant={config.latencyMs === ms ? 'default' : 'outline'}
                      onClick={() => config.set({ latencyMs: ms })}
                    >
                      {ms}
                    </Button>
                  ))}
                </div>
              </Field>
              <Field label={t('failure')}>
                <Select
                  value={config.failure}
                  onValueChange={(v) => {
                    config.set({ failure: v as FailureMode });
                    void queryClient.invalidateQueries();
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('failureNone')}</SelectItem>
                    <SelectItem value="network">{t('failureNetwork')}</SelectItem>
                    <SelectItem value="server">{t('failureServer')}</SelectItem>
                    <SelectItem value="unauthorized">{t('failureUnauthorized')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </section>

            <Separator />

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t('display')}</h3>
              <label className="flex items-center justify-between text-sm">
                {t('showScreenIds')}
                <Switch checked={showScreenIds} onCheckedChange={setShowScreenIds} />
              </label>
              {import.meta.env.DEV && (
                <label className="flex items-center justify-between text-sm">
                  {t('queryDevtools')}
                  <Switch checked={showQueryDevtools} onCheckedChange={setShowQueryDevtools} />
                </label>
              )}
            </section>

            <Separator />

            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setOpen(false);
                navigate('/design-system');
              }}
            >
              <PaletteIcon /> {t('uiKit')}
            </Button>

            <Button
              variant="outline"
              className="w-full text-destructive"
              onClick={() => void reset()}
            >
              <RotateCcwIcon /> {t('reset')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
