import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@rbp/ui';
import { type LoginInput, loginSchema } from '@rbp/validation';
import { BookOpenIcon, Loader2Icon } from 'lucide-react';
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

  const from = (location.state as { from?: string } | null)?.from;
  if (token && !login.isPending) return <Navigate to={from ?? '/'} replace />;

  const onSubmit = form.handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate(from ?? '/', { replace: true }) }),
  );

  return (
    <AuthLayout>
      <Screen id="AUTH-001" title={t('login.title')}>
        <div className="space-y-6">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-semibold tracking-tight">{t('login.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('login.subtitle')}</p>
          </div>
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('login.email')}</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="username" className="h-11" {...field} />
                    </FormControl>
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
                    <FormControl>
                      <Input
                        type="password"
                        autoComplete="current-password"
                        className="h-11"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {login.isError && (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {errorMessage(login.error)}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
                {login.isPending && <Loader2Icon className="animate-spin" />}
                {t('login.submit')}
              </Button>
            </form>
          </Form>

          <Link
            to="/guide"
            className="flex min-h-touch items-center justify-center gap-2 text-sm font-medium text-primary focus-ring hover:underline"
          >
            <BookOpenIcon className="size-4" /> {t('common:shell.userGuide')}
          </Link>

          {demoAccounts.data && demoAccounts.data.length > 0 && (
            <Card className="gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="text-sm">{t('login.demoAccounts')}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {t('login.demoHint', { password: demoAccounts.data[0]?.password ?? '' })}
                </p>
              </CardHeader>
              <CardContent className="grid gap-1 px-2">
                {demoAccounts.data.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    onClick={() => {
                      form.setValue('email', a.email, { shouldValidate: true });
                      form.setValue('password', a.password, { shouldValidate: true });
                    }}
                    className="flex min-h-touch items-center justify-between gap-3 rounded-md px-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{a.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {a.tenantName}
                      </span>
                    </span>
                    <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {a.roleName}
                    </span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </Screen>
    </AuthLayout>
  );
}
