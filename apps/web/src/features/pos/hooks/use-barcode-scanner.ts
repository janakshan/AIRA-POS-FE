import { useEffect, useEffectEvent } from 'react';

/** Keys closer together than this are a scanner, not a person typing. */
const MAX_GAP_MS = 50;
const MIN_LENGTH = 4;

/**
 * Hardware barcode scanners act as a keyboard: a fast burst of characters ending in Enter.
 * Captures bursts anywhere on the page except while typing in a field (POS-002).
 */
export function useBarcodeScanner(onScan: (code: string) => void, enabled = true) {
  const scan = useEffectEvent(onScan);
  useEffect(() => {
    if (!enabled) return;
    let buffer = '';
    let last = 0;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const now = performance.now();
      if (now - last > MAX_GAP_MS) buffer = '';
      last = now;
      if (e.key === 'Enter') {
        if (buffer.length >= MIN_LENGTH) {
          e.preventDefault();
          scan(buffer);
        }
        buffer = '';
      } else if (e.key.length === 1) {
        buffer += e.key;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
