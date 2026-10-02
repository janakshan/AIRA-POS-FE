import { ConfirmDialog } from '@rbp/ui';
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router';

/**
 * Ask before leaving a page with unsaved edits (in-app navigation).
 * Call `bypass()` right before navigating away after a successful save —
 * the dirty flag from the last render is still set at that point.
 */
export function useUnsavedChangesGuard(when: boolean) {
  const { t } = useTranslation('catalog');
  const skip = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      when && !skip.current && currentLocation.pathname !== nextLocation.pathname,
  );
  const bypass = useCallback(() => {
    skip.current = true;
  }, []);
  const dialog = (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => !open && blocker.reset?.()}
      title={t('common.unsavedTitle')}
      description={t('common.unsavedDescription')}
      confirmLabel={t('common.leave')}
      cancelLabel={t('common.stay')}
      destructive
      onConfirm={() => blocker.proceed?.()}
    />
  );
  return { dialog, bypass };
}
