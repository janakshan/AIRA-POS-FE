import type { Order } from '@rbp/types';
import { Button, EmptyState, RadioCard, RadioGroup, ResponsiveDialog, toast } from '@rbp/ui';
import { BikeIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useErrorMessage } from '@/components/use-error-message';
import { useAssignRider, useRiders } from '../api/queries';

/** DEL-003 pick the rider (with what they're already carrying); reassign until it leaves. */
export function AssignRiderDialog({
  order,
  onOpenChange,
}: {
  order: Order | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation('delivery');
  const errorMessage = useErrorMessage();
  const riders = useRiders(!!order);
  const assign = useAssignRider();
  const [riderId, setRiderId] = useState('');
  const [was, setWas] = useState(order);
  if (order !== was) {
    setWas(order);
    setRiderId(order?.delivery?.riderId ?? '');
  }

  const submit = () =>
    order &&
    assign.mutate(
      { id: order.id, body: { riderId } },
      {
        onSuccess: (o) => {
          toast.success(t('assign.done', { number: o.number, name: o.delivery?.riderName ?? '' }));
          onOpenChange(false);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <ResponsiveDialog
      open={!!order}
      onOpenChange={(o) => !assign.isPending && onOpenChange(o)}
      title={t('assign.title', { number: order?.number ?? '' })}
      description={order?.delivery?.address}
      closeLabel={t('close')}
      size="md"
      footer={
        <Button
          size="pos"
          className="w-full sm:w-auto"
          disabled={!riderId || riderId === order?.delivery?.riderId}
          loading={assign.isPending}
          onClick={submit}
        >
          {t('assign.confirm')}
        </Button>
      }
    >
      <div data-screen-id="DEL-003">
        {riders.data && !riders.data.length ? (
          <EmptyState icon={BikeIcon} title={t('assign.none')} />
        ) : (
          <RadioGroup
            value={riderId}
            onValueChange={setRiderId}
            aria-label={t('assign.rider')}
            className="grid gap-2"
          >
            {riders.data?.map((r) => (
              <RadioCard
                key={r.id}
                value={r.id}
                icon={<BikeIcon />}
                title={r.fullName}
                description={t('assign.load', { active: r.active, out: r.outNow })}
              />
            ))}
          </RadioGroup>
        )}
      </div>
    </ResponsiveDialog>
  );
}
