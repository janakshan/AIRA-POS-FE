import {
  Button,
  ConfirmDialog,
  ReasonDialog,
  ResponsiveDialog,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  toast,
} from '@rbp/ui';
import {
  MessageSquareWarningIcon,
  PanelRightIcon,
  ShieldCheckIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEmployeeVerification } from '@/features/auth/hooks/use-employee-verification';
import { DS_REASONS } from '../fixtures';
import { DsSection, Example } from './section';

export function DialogsSection() {
  const { t } = useTranslation('designSystem');
  const { t: tc } = useTranslation();
  const [open, setOpen] = useState<'responsive' | 'confirm' | 'reason' | 'sheet' | null>(null);
  const [voiding, setVoiding] = useState(false);
  const verify = useEmployeeVerification();
  const close = () => setOpen(null);

  return (
    <DsSection id="dialogs" title={t('sections.dialogs')}>
      <Example title={t('sections.dialogs')} hint={t('dialogs.responsiveHint')}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Button variant="outline" onClick={() => setOpen('responsive')}>
            <SquareIcon /> {t('dialogs.responsive')}
          </Button>
          <Button variant="outline" onClick={() => setOpen('confirm')}>
            <Trash2Icon /> {t('dialogs.confirm')}
          </Button>
          <Button variant="outline" onClick={() => setOpen('reason')}>
            <MessageSquareWarningIcon /> {t('dialogs.reason')}
          </Button>
          <Button variant="outline" onClick={() => void verify('pos.item.remove')}>
            <ShieldCheckIcon /> {t('dialogs.pin')}
          </Button>
          <Button variant="outline" onClick={() => setOpen('sheet')}>
            <PanelRightIcon /> {t('dialogs.sheet')}
          </Button>
        </div>
      </Example>

      <ResponsiveDialog
        open={open === 'responsive'}
        onOpenChange={(o) => !o && close()}
        title={t('dialogs.responsive')}
        description={t('dialogs.responsiveHint')}
        closeLabel={tc('actions.close')}
        footer={
          <>
            <Button variant="outline" onClick={close}>
              {tc('actions.cancel')}
            </Button>
            <Button onClick={close}>{tc('actions.confirm')}</Button>
          </>
        }
      >
        <p>{t('dialogs.responsiveBody')}</p>
      </ResponsiveDialog>

      <ConfirmDialog
        open={open === 'confirm'}
        onOpenChange={(o) => !o && close()}
        destructive
        loading={voiding}
        title={t('dialogs.confirmTitle')}
        description={t('dialogs.confirmBody')}
        confirmLabel={t('dialogs.confirmAction')}
        cancelLabel={tc('actions.cancel')}
        onConfirm={() => {
          setVoiding(true);
          window.setTimeout(() => {
            setVoiding(false);
            close();
            toast.success(t('dialogs.voided'));
          }, 900);
        }}
      />

      <ReasonDialog
        open={open === 'reason'}
        onOpenChange={(o) => !o && close()}
        title={t('dialogs.reasonTitle')}
        reasons={DS_REASONS}
        submitLabel={t('dialogs.reasonSubmit')}
        cancelLabel={tc('actions.cancel')}
        commentLabel={t('dialogs.reasonComment')}
        translate={(k) => tc(k)}
        onSubmit={(v) => {
          close();
          toast.info(
            t('dialogs.reasonChosen', {
              reason: DS_REASONS.find((r) => r.code === v.reasonCode)?.label,
            }),
          );
        }}
      />

      <Sheet open={open === 'sheet'} onOpenChange={(o) => !o && close()}>
        <SheetContent closeLabel={tc('actions.close')}>
          <SheetHeader>
            <SheetTitle>{t('dialogs.sheetTitle')}</SheetTitle>
            <SheetDescription>{t('dialogs.sheetBody')}</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    </DsSection>
  );
}
