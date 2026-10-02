import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@rbp/ui';
import { cn } from '@rbp/utils';
import { ZoomInIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { shotUrl } from '../guide-content';

interface GuideShotProps {
  shot: string;
  /** Plain-text description, used as alt text and the zoom dialog title. */
  alt: string;
  mobile?: boolean;
}

/** A screenshot that opens full size in a dialog. */
export function GuideShot({ shot, alt, mobile }: GuideShotProps) {
  const { t } = useTranslation('guide');
  const src = shotUrl(shot);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'group relative block overflow-hidden rounded-lg border bg-muted shadow-sm focus-ring',
            mobile ? 'w-full max-w-60' : 'w-full',
          )}
          aria-label={t('page.zoom')}
        >
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            width={mobile ? 390 : 1366}
            height={mobile ? 844 : 768}
            className="h-auto w-full"
          />
          <span className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <ZoomInIcon className="size-4" />
          </span>
        </button>
      </DialogTrigger>
      <DialogContent
        size={mobile ? 'md' : 'full'}
        closeLabel={t('common:actions.close', { defaultValue: 'Close' })}
        className="flex flex-col sm:h-auto"
      >
        <DialogTitle className="pr-10 text-sm font-medium">{alt}</DialogTitle>
        <DialogDescription className="sr-only">{t('page.zoomHint')}</DialogDescription>
        <img
          src={src}
          alt={alt}
          className="mx-auto h-auto max-h-[80dvh] w-auto max-w-full rounded-md border"
        />
      </DialogContent>
    </Dialog>
  );
}
