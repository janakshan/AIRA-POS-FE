import { Input } from '@rbp/ui';
import { type ComponentProps, useState } from 'react';

const toText = (bps: number | null) => (bps === null ? '' : String(bps / 100));

/** A percentage typed as "12.5", stored as basis points (1250). Up to two decimals. */
export function PercentInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  value: number | null;
  onChange: (bps: number | null) => void;
}) {
  const [draft, setDraft] = useState(toText(value));
  // Follow outside changes (form reset) without fighting the user's typing.
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    if (Math.round(Number(draft) * 100) !== value) setDraft(toText(value));
  }
  return (
    <div className="relative">
      <Input
        {...props}
        inputMode="decimal"
        value={draft}
        className="pr-8"
        onChange={(e) => {
          const text = e.target.value.replace(/[^\d.]/g, '');
          if (!/^\d*(\.\d{0,2})?$/.test(text)) return;
          setDraft(text);
          onChange(text === '' || text === '.' ? null : Math.round(Number(text) * 100));
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}
