import { type Label as LabelPrimitive, Slot } from 'radix-ui';
import * as React from 'react';
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { cn } from '@rbp/utils';
import { Label } from './label';

/** shadcn-style form bindings for React Hook Form. */
export const Form = FormProvider;

interface FormFieldContextValue {
  name: string;
}
const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

export function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

const FormItemContext = React.createContext<{ id: string } | null>(null);

/**
 * Optional translator so validation messages (which are i18n keys) render localised.
 * Provided once by the app via <FormMessageTranslator>.
 */
const TranslateContext = React.createContext<(key: string) => string>((key) => key);
export const FormMessageTranslator = TranslateContext.Provider;

export function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();
  if (!fieldContext || !itemContext) {
    throw new Error('useFormField should be used within <FormField> and <FormItem>');
  }
  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);
  const { id } = itemContext;
  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
}

export function FormItem({ className, ...props }: React.ComponentProps<'div'>) {
  const id = React.useId();
  return (
    <FormItemContext.Provider value={{ id }}>
      <div data-slot="form-item" className={cn('grid gap-2', className)} {...props} />
    </FormItemContext.Provider>
  );
}

export function FormLabel({
  className,
  children,
  required,
  optionalLabel,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root> & {
  /** Shows a required marker (the schema still enforces it). */
  required?: boolean;
  /** Text for an optional marker, e.g. "Optional". Omit to hide. */
  optionalLabel?: string;
}) {
  const { error, formItemId } = useFormField();
  return (
    <Label
      data-error={!!error}
      className={cn('data-[error=true]:text-destructive', className)}
      htmlFor={formItemId}
      {...props}
    >
      {children}
      {required && (
        <span aria-hidden className="text-destructive">
          *
        </span>
      )}
      {optionalLabel && !required && (
        <span className="text-caption font-normal text-muted-foreground">({optionalLabel})</span>
      )}
    </Label>
  );
}

export function FormControl(props: React.ComponentProps<typeof Slot.Root>) {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
  return (
    <Slot.Root
      id={formItemId}
      aria-describedby={!error ? formDescriptionId : `${formDescriptionId} ${formMessageId}`}
      aria-invalid={!!error}
      {...props}
    />
  );
}

export function FormDescription({ className, ...props }: React.ComponentProps<'p'>) {
  const { formDescriptionId } = useFormField();
  return (
    <p
      id={formDescriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
}

export function FormMessage({ className, children, ...props }: React.ComponentProps<'p'>) {
  const { error, formMessageId } = useFormField();
  const translate = React.useContext(TranslateContext);
  const body = error ? translate(String(error.message ?? '')) : children;
  if (!body) return null;
  return (
    <p
      id={formMessageId}
      role={error ? 'alert' : undefined}
      className={cn('text-sm text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  );
}

/**
 * Lists every field error at the top of a long form (shown after a failed submit),
 * with links that move focus to the field.
 */
export function FormErrorSummary({
  title,
  labels,
  className,
}: {
  title: React.ReactNode;
  /** Field name → visible label. Fields without a label fall back to their name. */
  labels?: Record<string, React.ReactNode>;
  className?: string;
}) {
  const { formState, setFocus } = useFormContext();
  const translate = React.useContext(TranslateContext);
  const entries = Object.entries(formState.errors);
  if (!formState.isSubmitted || entries.length === 0) return null;
  return (
    <div
      role="alert"
      className={cn(
        'rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm',
        className,
      )}
    >
      <p className="font-medium text-destructive">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {entries.map(([name, err]) => (
          <li key={name}>
            <button
              type="button"
              className="rounded-sm text-left underline-offset-2 focus-ring hover:underline"
              onClick={() => setFocus(name)}
            >
              {labels?.[name] ?? name}: {translate(String(err?.message ?? ''))}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
