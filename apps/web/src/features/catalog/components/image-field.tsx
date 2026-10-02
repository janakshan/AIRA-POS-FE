import { MAX_IMAGE_URL_LENGTH } from '@rbp/validation';
import { Button } from '@rbp/ui';
import { ImageIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const MAX_SIDE = 256;

/**
 * Downscale an image to ≤256px and encode it (WebP, JPEG fallback) so button images stay small.
 * The real API would upload the file and return a URL; the field value is a URL either way.
 */
async function toSmallDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const webp = canvas.toDataURL('image/webp', 0.82);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.82);
}

export interface ImageFieldProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  /** Accessible name, e.g. "Button image". */
  label: string;
  id?: string;
}

/** Button image picker (CAT-002/004): upload, preview, replace or remove. */
export function ImageField({ value, onChange, label, id }: ImageFieldProps) {
  const { t } = useTranslation('catalog');
  const inputRef = useRef<HTMLInputElement>(null);
  const fallbackId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const url = await toSmallDataUrl(file);
      if (url.length > MAX_IMAGE_URL_LENGTH) throw new Error('too large');
      onChange(url);
    } catch {
      setError(t('common.imageError'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border bg-muted">
        {value ? (
          <img src={value} alt={label} className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-7 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          id={id ?? fallbackId}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          aria-label={label}
          onChange={(e) => void pick(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          loading={busy}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon /> {t(value ? 'common.imageReplace' : 'common.imageUpload')}
        </Button>
        {value && (
          <Button type="button" variant="ghost" onClick={() => onChange(null)}>
            <Trash2Icon /> {t('common.imageRemove')}
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="w-full text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
