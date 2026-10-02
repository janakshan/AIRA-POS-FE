import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@rbp/ui';
import { cn } from '@rbp/utils';
import { type LoginInput, loginSchema } from '@rbp/validation';
import {
  ArrowRightIcon,
  BookOpenIcon,
  ChevronDownIcon,
  EyeIcon,
  EyeOffIcon,
  Loader2Icon,
  FlaskConicalIcon,
  LockIcon,
  MailIcon,
} from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { Screen } from '@/components/screen';
import { useErrorMessage } from '@/components/use-error-message';
import { useDemoAccounts } from '@/features/dev-tools/api/queries';
import { useSessionStore } from '@/stores/session-store';
import { useLogin } from '../api/queries';
import { AuthLayout } from '../components/auth-layout';

/** AUTH-001 Login */
export function LoginPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const location = useLocation();
  const token = useSessionStore((s) => s.accessToken);
  const login = useLogin();
  const errorMessage = useErrorMessage();
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const demoAccounts = useDemoAccounts();
  const [showPassword, setShowPassword] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const demoPanelId = useId();
  const submitRef = useRef<HTMLButtonElement>(null);

  const from = (location.state as { from?: string } | null)?.from;
  if (token && !login.isPending) return <Navigate to={from ?? '/'} replace />;

  const onSubmit = form.handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(from ?? '/', { replace: true }) }),
  );

  return (
    <AuthLayout>
      <Screen id="AUTH-001" title={t('login.title')}>
        <div className="space-y-7">
          <div className="space-y-2">
            <p className="text-sm font-semibold text-primary">{t('login.welcome')}</p>
            <h1 className="text-3xl font-semibold tracking-tight">{t('login.title')}</h1>
            <p className="text-muted-foreground">{t('login.subtitle')}</p>
          </div>
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.email')}</FormLabel>
                    <div className="relative">
                      <MailIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="username"
                          placeholder="you@business.com"
                          className="h-12 rounded-xl bg-background/70 pl-10"
                          {...field}
                        />
                      </FormControl>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.password')}</FormLabel>
                    <div className="relative">
                      <LockIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <FormControl>
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="current-password"
                          className="h-12 rounded-xl bg-background/70 px-10"
                          {...field}
                        />
                      </FormControl>
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={
                          showPassword ? t('login.hidePassword') : t('login.showPassword')
                        }
                        aria-pressed={showPassword}
                        className="absolute top-1/2 right-1 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground focus-ring hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOffIcon className="size-4" />
                        ) : (
                          <EyeIcon className="size-4" />
                        )}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {login.isError && (
                <p
                  role="alert"
                  className="rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
                >
                  {errorMessage(login.error)}
                </p>
              )}
              <Button
                ref={submitRef}
                type="submit"
                size="lg"
                className="group h-12 w-full rounded-xl text-base shadow-lg shadow-primary/25"
                disabled={login.isPending}
              >
                {login.isPending && <Loader2Icon className="animate-spin" />}
                {t('login.submit')}
                {!login.isPending && (
                  <ArrowRightIcon className="transition-transform group-hover:translate-x-0.5" />
                )}
              </Button>
            </form>
          </Form>

          {demoAccounts.data && demoAccounts.data.length > 0 && (
            <section className="overflow-hidden rounded-2xl border bg-background/50">
              <button
                type="button"
                onClick={() => setDemoOpen((v) => !v)}
                aria-expanded={demoOpen}
                aria-controls={demoPanelId}
                className="flex min-h-touch w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium focus-ring transition-colors hover:bg-accent/60"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <FlaskConicalIcon className="size-4" />
                </span>
                <span className="flex-1">{t('login.demoAccounts')}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                  {demoAccounts.data.length}
                </span>
                <ChevronDownIcon
                  className={cn(
                    'size-4 text-muted-foreground transition-transform duration-300 motion-reduce:transition-none',
                    demoOpen && 'rotate-180',
                  )}
                />
              </button>
              <div
                id={demoPanelId}
                inert={!demoOpen}
                className={cn(
                  'grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none',
                  demoOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="space-y-2 border-t px-1.5 pt-3 pb-1.5">
                    <p className="px-2.5 text-xs text-muted-foreground">
                      {t('login.demoHint', { password: demoAccounts.data[0]?.password ?? '' })}
                    </p>
                    <div className="grid max-h-72 gap-0.5 overflow-y-auto">
                      {demoAccounts.data.map((a) => (
                        <button
                          key={a.email}
                          type="button"
                          onClick={() => {
                            form.setValue('email', a.email, { shouldValidate: true });
                            form.setValue('password', a.password, { shouldValidate: true });
                            setDemoOpen(false);
                            submitRef.current?.focus();
                          }}
                          className="flex min-h-touch items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm focus-ring transition-colors hover:bg-accent"
                        >
                          <span
                            aria-hidden
                            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                          >
                            {initials(a.displayName)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{a.displayName}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {a.tenantName}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                            {a.roleName}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          <Link
            to="/guide"
            className="flex min-h-touch items-center justify-center gap-2 text-sm font-medium text-muted-foreground focus-ring transition-colors hover:text-primary"
          >
            <BookOpenIcon className="size-4" /> {t('common:shell.userGuide')}
          </Link>
        </div>
      </Screen>
    </AuthLayout>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
