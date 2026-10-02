import { Alert, Button, STATUS_TONES, StatusBadge, StatusDot } from '@rbp/ui';
import { useTranslation } from 'react-i18next';
import { DsSection, Example } from './section';

export function StatusSection() {
  const { t } = useTranslation('designSystem');
  return (
    <DsSection id="status" title={t('sections.status')}>
      <Example title={t('status.badges')} hint={t('status.badgesHint')} className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {Object.keys(STATUS_TONES).map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status="PENDING" size="sm" />
          <StatusBadge status="PENDING" size="md" />
          <StatusBadge status="PENDING" size="lg" />
          <StatusBadge status="PREPARING" size="lg" />
          <StatusBadge status="READY" size="lg" />
        </div>
      </Example>
      <div className="grid gap-stack lg:grid-cols-[1fr_2fr]">
        <Example title={t('status.dots')} className="space-y-3">
          {(
            [
              ['success', t('status.online'), true],
              ['warning', t('status.busy'), false],
              ['danger', t('status.offline'), false],
            ] as const
          ).map(([tone, label, pulse]) => (
            <div key={tone} className="flex items-center gap-2.5">
              <StatusDot tone={tone} pulse={pulse} />
              <span>{label}</span>
            </div>
          ))}
        </Example>
        <Example title={t('status.alerts')} className="space-y-3">
          <Alert tone="info">{t('status.alertInfo')}</Alert>
          <Alert tone="success">{t('status.alertSuccess')}</Alert>
          <Alert tone="warning" title={t('status.alertWarning')} />
          <Alert
            tone="danger"
            title={t('status.alertDanger')}
            action={
              <Button size="sm" variant="outline">
                {t('status.retry')}
              </Button>
            }
          />
        </Example>
      </div>
    </DsSection>
  );
}
