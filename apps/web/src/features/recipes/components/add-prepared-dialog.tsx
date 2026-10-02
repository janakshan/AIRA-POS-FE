import {
  Button,
  NumberInput,
  ResponsiveDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@rbp/ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useCreatePreparedItem, useRecipes } from '../api/queries';

/** REC-005 made extra: cooked food ready to sell (recipe dishes use their ingredients now). */
export function AddPreparedDialog({
  open,
  onOpenChange,
  locationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locationId: string;
}) {
  const { t } = useTranslation('recipes');
  const errorMessage = useErrorMessage();
  const recipes = useRecipes(locationId);
  const create = useCreatePreparedItem();
  const ids = { dish: useId(), qty: useId(), hours: useId() };
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState<number | null>(1);
  const [hours, setHours] = useState<number | null>(4);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setProductId('');
      setQuantity(1);
      setHours(4);
    }
  }
  const dishes = [
    ...(recipes.data?.recipes
      .filter((r) => r.isActive)
      .map((r) => ({ productId: r.productId, name: r.productName, recipe: true })) ?? []),
    ...(recipes.data?.withoutRecipe.map((p) => ({ ...p, recipe: false })) ?? []),
  ];
  const chosen = dishes.find((d) => d.productId === productId);

  const submit = () =>
    create.mutate(
      { productId, quantity: quantity ?? 1, shelfLifeHours: hours ?? 4 },
      {
        onSuccess: (p) => {
          toast.success(t('prepared.added', { name: p.productName, count: p.quantity }));
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !create.isPending && onOpenChange(o)}
      title={t('prepared.addTitle')}
      description={t('prepared.addHint')}
      closeLabel={t('close')}
      size="md"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!productId || !quantity}
          loading={create.isPending}
          onClick={submit}
        >
          {t('prepared.addConfirm')}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={ids.dish} className="text-sm font-medium">
            {t('fields.dish')}
          </label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger id={ids.dish} className="w-full">
              <SelectValue placeholder={t('form.chooseDish')} />
            </SelectTrigger>
            <SelectContent>
              {dishes.map((d) => (
                <SelectItem key={d.productId} value={d.productId}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chosen && (
            <p className="text-xs text-muted-foreground">
              {t(chosen.recipe ? 'prepared.usesIngredients' : 'prepared.finishedItem')}
            </p>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={ids.qty} className="text-sm font-medium">
              {t('fields.quantity')}
            </label>
            <NumberInput
              id={ids.qty}
              value={quantity}
              min={1}
              max={100}
              onChange={setQuantity}
              decrementLabel={t('less')}
              incrementLabel={t('more')}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={ids.hours} className="text-sm font-medium">
              {t('prepared.sellWithin')}
            </label>
            <NumberInput
              id={ids.hours}
              value={hours}
              min={1}
              max={48}
              onChange={setHours}
              decrementLabel={t('prepared.fewerHours')}
              incrementLabel={t('prepared.moreHours')}
            />
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
