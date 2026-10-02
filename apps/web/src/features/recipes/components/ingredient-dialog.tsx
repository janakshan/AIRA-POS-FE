import { isApiError } from '@rbp/api-client';
import type { Ingredient, StockUnit } from '@rbp/types';
import {
  Button,
  Input,
  NumberInput,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@rbp/ui';
import { type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useSaveIngredient } from '../api/queries';

const UNITS: StockUnit[] = ['portion', 'pcs', 'pack'];

/** REC-001 new / edit ingredient: what it is, how it's counted, what a portion is, its minimum. */
export function IngredientDialog({
  open,
  onOpenChange,
  ingredient,
  locationId,
  locationName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Edit when set. */
  ingredient: Ingredient | null;
  locationId: string;
  locationName: string;
}) {
  const { t } = useTranslation('recipes');
  const errorMessage = useErrorMessage();
  const save = useSaveIngredient();
  const ids = {
    code: useId(),
    name: useId(),
    unit: useId(),
    portion: useId(),
    grams: useId(),
    perPack: useId(),
    min: useId(),
  };
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<StockUnit>('portion');
  const [portion, setPortion] = useState('');
  const [grams, setGrams] = useState<number | null>(null);
  const [perPack, setPerPack] = useState<number | null>(null);
  const [minStock, setMinStock] = useState<number | null>(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCode(ingredient?.code ?? '');
      setName(ingredient?.name ?? '');
      setUnit(ingredient?.unit ?? 'portion');
      setPortion(ingredient?.portion?.description ?? '');
      setGrams(ingredient?.portion?.grams ?? null);
      setPerPack(ingredient?.portion?.perPack ?? null);
      setMinStock(ingredient?.levels[0]?.minStock ?? 0);
      setErrors({});
    }
  }

  const submit = () => {
    const local: Record<string, string> = {};
    if (!code.trim()) local.code = 'validation.required';
    if (name.trim().length < 2) local.name = 'validation.nameMin';
    // Grams and per pack measure the portion the description names (REC-004), so they can't
    // outlive it: ask for the description rather than silently dropping the numbers.
    if (!portion.trim() && (grams || perPack)) local.portion = 'validation.portionDescribe';
    setErrors(local);
    if (Object.keys(local).length) return;
    save.mutate(
      {
        ...(ingredient ? { id: ingredient.id } : {}),
        body: {
          code: code.trim(),
          name: name.trim(),
          unit,
          portion: portion.trim()
            ? {
                description: portion.trim(),
                ...(grams ? { grams } : {}),
                ...(perPack ? { perPack } : {}),
              }
            : null,
          minStock: minStock ?? 0,
          locationId,
        },
      },
      {
        onSuccess: (saved) => {
          toast.success(
            t(ingredient ? 'ingredient.updated' : 'ingredient.created', { name: saved.name }),
          );
          onOpenChange(false);
        },
        onError: (e) => {
          const fieldErrors =
            isApiError(e) && e.details?.fieldErrors
              ? (e.details.fieldErrors as Record<string, string>)
              : null;
          if (fieldErrors) setErrors(fieldErrors);
          else toast.error(errorMessage(e));
        },
      },
    );
  };

  const field = (
    id: string,
    label: ReactNode,
    control: ReactNode,
    error?: string,
    hint?: string,
  ) => (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {control}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {t(`common:${error}`)}
        </p>
      ) : (
        hint && <p className="text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !save.isPending && onOpenChange(o)}
      title={
        ingredient ? t('ingredient.editTitle', { name: ingredient.name }) : t('ingredient.newTitle')
      }
      description={t('ingredient.dialogHint')}
      closeLabel={t('close')}
      size="lg"
      footer={
        <Button size="pos" className="w-full sm:w-auto" loading={save.isPending} onClick={submit}>
          {t('ingredient.save')}
        </Button>
      }
    >
      <div data-screen-id="REC-001" className="grid gap-4 sm:grid-cols-2">
        {field(
          ids.name,
          t('fields.name'),
          <Input
            id={ids.name}
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('ingredient.namePlaceholder')}
            aria-invalid={!!errors.name}
          />,
          errors.name,
        )}
        {field(
          ids.code,
          t('fields.code'),
          <Input
            id={ids.code}
            value={code}
            maxLength={20}
            onChange={(e) => setCode(e.target.value)}
            placeholder="I05"
            aria-invalid={!!errors.code}
          />,
          errors.code,
        )}
        {field(
          ids.unit,
          t('fields.countedIn'),
          <Select value={unit} onValueChange={(v) => setUnit(v as StockUnit)}>
            <SelectTrigger id={ids.unit} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UNITS.map((u) => (
                <SelectItem key={u} value={u}>
                  {t(`inventory:unit.${u}`, { count: 2 })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>,
          undefined,
          t('ingredient.unitHint'),
        )}
        {field(
          ids.min,
          t('ingredient.minimumAt', { location: locationName }),
          <NumberInput
            id={ids.min}
            value={minStock}
            min={0}
            max={100000}
            onChange={setMinStock}
            decrementLabel={t('less')}
            incrementLabel={t('more')}
          />,
          undefined,
          t('ingredient.minimumHint'),
        )}
        <div className="sm:col-span-2">
          {field(
            ids.portion,
            t('fields.portion'),
            <Input
              id={ids.portion}
              value={portion}
              maxLength={80}
              onChange={(e) => setPortion(e.target.value)}
              placeholder={t('portion.placeholder')}
              aria-invalid={!!errors.portion}
            />,
            errors.portion,
            t('portion.hint'),
          )}
        </div>
        {field(
          ids.grams,
          t('fields.grams'),
          <NumberInput
            id={ids.grams}
            value={grams}
            min={1}
            max={100000}
            stepper={false}
            onChange={setGrams}
          />,
        )}
        {field(
          ids.perPack,
          t('fields.perPack'),
          <NumberInput
            id={ids.perPack}
            value={perPack}
            min={1}
            max={10000}
            stepper={false}
            onChange={setPerPack}
          />,
          undefined,
          t('portion.perPackHint'),
        )}
      </div>
    </ResponsiveDialog>
  );
}
