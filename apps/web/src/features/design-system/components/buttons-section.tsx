import { Button, ButtonGroup } from '@rbp/ui';
import { PlusIcon, SaveIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DsSection, Example } from './section';

export function ButtonsSection() {
  const { t } = useTranslation('designSystem');
  const [range, setRange] = useState('day');
  const [saving, setSaving] = useState(false);
  return (
    <DsSection id="buttons" title={t('sections.buttons')}>
      <div className="grid gap-stack lg:grid-cols-2">
        <Example title={t('buttons.variants')} className="flex flex-wrap gap-2">
          <Button>{t('buttons.primary')}</Button>
          <Button variant="secondary">{t('buttons.secondary')}</Button>
          <Button variant="outline">{t('buttons.outline')}</Button>
          <Button variant="ghost">{t('buttons.ghost')}</Button>
          <Button variant="success">{t('buttons.success')}</Button>
          <Button variant="warning">{t('buttons.warning')}</Button>
          <Button variant="destructive">
            <Trash2Icon /> {t('buttons.destructive')}
          </Button>
          <Button variant="link">{t('buttons.link')}</Button>
        </Example>
        <Example title={t('buttons.statesTitle')} className="flex flex-wrap items-center gap-2">
          <Button
            loading={saving}
            onClick={() => {
              setSaving(true);
              window.setTimeout(() => setSaving(false), 1500);
            }}
          >
            <SaveIcon /> {t('buttons.loading')}
          </Button>
          <Button disabled>{t('buttons.disabled')}</Button>
          <Button variant="outline">
            <PlusIcon /> {t('buttons.withIcon')}
          </Button>
          <Button size="icon" variant="outline" aria-label={t('buttons.withIcon')}>
            <PlusIcon />
          </Button>
        </Example>
      </div>
      <Example title={t('buttons.sizes')} className="flex flex-wrap items-end gap-2">
        <Button size="sm">sm 32</Button>
        <Button>default 40</Button>
        <Button size="lg">lg 44</Button>
        <Button size="pos">pos 56</Button>
        <Button size="pos-lg">pos-lg 80</Button>
        <Button size="icon-lg" variant="secondary" aria-label="icon-lg">
          <PlusIcon />
        </Button>
      </Example>
      <Example title={t('buttons.group')}>
        <ButtonGroup>
          {(['day', 'week', 'month'] as const).map((r) => (
            <Button
              key={r}
              variant={range === r ? 'default' : 'outline'}
              aria-pressed={range === r}
              onClick={() => setRange(r)}
            >
              {t(`buttons.${r}`)}
            </Button>
          ))}
        </ButtonGroup>
      </Example>
    </DsSection>
  );
}
