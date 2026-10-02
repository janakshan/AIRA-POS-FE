import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  EmptyState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
  RadioCard,
  RadioGroup,
} from '@rbp/ui';
import { type LocationSelectInput, locationSelectSchema } from '@rbp/validation';
import { MapPinIcon, StoreIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { Screen } from '@/components/screen';
import { useSessionStore } from '@/stores/session-store';
import { useLogout, useMe, useSwitchLocation } from '../api/queries';
import { AuthLayout } from '../components/auth-layout';

/** AUTH-003 Location Selection */
export function SelectLocationPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const { data: me } = useMe();
  const currentId = useSessionStore((s) => s.locationId);
  const switchLocation = useSwitchLocation();
  const logout = useLogout();
  const form = useForm<LocationSelectInput>({
    resolver: zodResolver(locationSelectSchema),
    defaultValues: { locationId: currentId ?? '' },
  });

  const locations = me?.locations ?? [];
  const from = (routerLocation.state as { from?: string } | null)?.from ?? '/';

  const choose = (locationId: string) => {
    switchLocation(locationId);
    navigate(from, { replace: true });
  };

  // Single-location users skip this step.
  const only = locations.length === 1 ? locations[0] : undefined;
  useEffect(() => {
    if (only) choose(only.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [only?.id]);

  return (
    <AuthLayout>
      <Screen id="AUTH-003" title={t('location.title')}>
        <div className="space-y-6">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-primary">{me?.tenant.name}</p>
            <h1 className="text-2xl font-semibold tracking-tight">{t('location.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('location.subtitle')}</p>
          </div>
          {locations.length === 0 ? (
            <EmptyState icon={MapPinIcon} title={t('location.none')} />
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit((v) => choose(v.locationId))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="locationId"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          aria-label={t('location.title')}
                          className="gap-2"
                        >
                          {locations.map((loc) => (
                            <RadioCard
                              key={loc.id}
                              value={loc.id}
                              icon={<StoreIcon />}
                              title={loc.name}
                              description={`${loc.code} · ${loc.address}`}
                            />
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" size="lg" className="w-full">
                  {t('location.submit')}
                </Button>
              </form>
            </Form>
          )}
          <Button
            variant="link"
            className="w-full"
            onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
          >
            {t('common:actions.signOut')}
          </Button>
        </div>
      </Screen>
    </AuthLayout>
  );
}
