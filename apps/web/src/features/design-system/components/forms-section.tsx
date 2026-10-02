import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Checkbox,
  Form,
  FormActions,
  FormControl,
  FormDescription,
  FormErrorSummary,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormSection,
  Input,
  MoneyInput,
  NumberInput,
  RadioCard,
  RadioGroup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
  toast,
} from '@rbp/ui';
import { formatMoney } from '@rbp/utils';
import { ReceiptIcon, TagIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { DS_CATEGORIES } from '../fixtures';
import { type ProductFormValues, productFormSchema } from '../schemas/product-form';
import { DsSection, Example } from './section';

const DEFAULTS: ProductFormValues = {
  name: '',
  categoryId: '',
  price: null,
  openingStock: 0,
  description: '',
  taxMode: 'INCLUSIVE',
  active: true,
  showOnQuickPad: true,
};

export function FormsSection() {
  const { t } = useTranslation('designSystem');
  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: DEFAULTS,
  });

  const onSubmit = form.handleSubmit((v) => {
    toast.success(t('forms.saved', { name: v.name, price: v.price ? formatMoney(v.price) : '' }));
    form.reset(DEFAULTS);
  });

  return (
    <DsSection id="forms" title={t('sections.forms')}>
      <Example title={t('forms.title')} hint={t('forms.hint')}>
        <Form {...form}>
          <form onSubmit={onSubmit} noValidate className="space-y-section">
            <FormErrorSummary
              title={t('forms.errorSummary')}
              labels={{
                name: t('forms.name'),
                categoryId: t('forms.category'),
                price: t('forms.price'),
              }}
            />
            <FormSection title={t('forms.basics')} description={t('forms.basicsHint')}>
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('forms.name')}</FormLabel>
                    <FormControl>
                      <Input placeholder={t('forms.namePlaceholder')} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('forms.category')}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t('forms.categoryPlaceholder')} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {DS_CATEGORIES.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem data-span="full">
                    <FormLabel optionalLabel={t('forms.optional')}>
                      {t('forms.description')}
                    </FormLabel>
                    <FormControl>
                      <Textarea rows={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <FormSection title={t('forms.pricing')} description={t('forms.pricingHint')}>
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel required>{t('forms.price')}</FormLabel>
                    <FormControl>
                      <MoneyInput
                        currency="LKR"
                        symbol="Rs."
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="openingStock"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('forms.openingStock')}</FormLabel>
                    <FormControl>
                      <NumberInput
                        min={0}
                        max={9999}
                        value={field.value}
                        onChange={field.onChange}
                        name={field.name}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="taxMode"
                render={({ field }) => (
                  <FormItem data-span="full">
                    <FormLabel>{t('forms.taxMode')}</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="gap-2 sm:grid-cols-2"
                      >
                        <RadioCard
                          value="INCLUSIVE"
                          icon={<TagIcon />}
                          title={t('forms.taxInclusive')}
                          description={t('forms.taxInclusiveHint')}
                        />
                        <RadioCard
                          value="EXCLUSIVE"
                          icon={<ReceiptIcon />}
                          title={t('forms.taxExclusive')}
                          description={t('forms.taxExclusiveHint')}
                        />
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )}
              />
            </FormSection>

            <FormSection title={t('forms.options')}>
              <FormField
                control={form.control}
                name="active"
                render={({ field }) => (
                  <FormItem className="flex min-h-touch items-center justify-between gap-4 rounded-lg border px-3">
                    <FormLabel>{t('forms.active')}</FormLabel>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="showOnQuickPad"
                render={({ field }) => (
                  <FormItem className="flex min-h-touch flex-row items-center gap-3 rounded-lg border px-3">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                    </FormControl>
                    <FormLabel>{t('forms.quickPad')}</FormLabel>
                    <FormDescription className="sr-only">{t('forms.quickPad')}</FormDescription>
                  </FormItem>
                )}
              />
            </FormSection>

            <FormActions>
              <Button type="button" variant="outline" onClick={() => form.reset(DEFAULTS)}>
                {t('forms.cancel')}
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                {t('forms.save')}
              </Button>
            </FormActions>
          </form>
        </Form>
      </Example>
    </DsSection>
  );
}
