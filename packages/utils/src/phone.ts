/**
 * Phone numbers are stored in E.164 (`+94771234567`) so lookups match however staff type them.
 * Sri Lanka (+94) is the default country; other numbers must be entered with their + prefix.
 */
const DEFAULT_COUNTRY = '94';

/** Normalize to E.164, or null if it isn't a plausible phone number. */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  let e164: string;
  if (raw.startsWith('+') || raw.startsWith('00')) {
    e164 = `+${raw.startsWith('00') ? digits.slice(2) : digits}`;
  } else if (digits.startsWith(DEFAULT_COUNTRY) && digits.length === 11) {
    e164 = `+${digits}`;
  } else if (digits.startsWith('0') && digits.length === 10) {
    e164 = `+${DEFAULT_COUNTRY}${digits.slice(1)}`;
  } else if (digits.length === 9 && !digits.startsWith('0')) {
    e164 = `+${DEFAULT_COUNTRY}${digits}`;
  } else {
    return null;
  }
  const national = e164.slice(1);
  if (national.length < 8 || national.length > 15) return null;
  if (national.startsWith(DEFAULT_COUNTRY) && national.length !== 11) return null;
  return e164;
}

/** Display form: Sri Lankan numbers as `077 123 4567`, others unchanged. */
export function formatPhone(e164: string): string {
  if (e164.startsWith(`+${DEFAULT_COUNTRY}`) && e164.length === 12) {
    const n = `0${e164.slice(3)}`;
    return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`;
  }
  return e164;
}
