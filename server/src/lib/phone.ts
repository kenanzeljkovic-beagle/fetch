/**
 * Normalise US phone numbers to E.164. Returns null when the number can't be
 * normalised safely — the caller must stop the call and show an error.
 *
 *   "(813) 555-1234"   -> "+18135551234"
 *   "813.555.1234"     -> "+18135551234"
 *   "1 813 555 1234"   -> "+18135551234"
 *   "+18135551234"     -> "+18135551234"
 *   "+44 20 7946 0958" -> "+442079460958"  (already international: kept as-is)
 */
export function toE164(raw: string | null | undefined, defaultCountryCode = '1'): string | null {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (hasPlus) {
    return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

export const isE164 = (s: string) => /^\+[1-9]\d{7,14}$/.test(s);

/** "+18135551234" -> "(813) 555-1234" for display; other formats pass through. */
export function formatForDisplay(e164: string | null): string {
  if (!e164) return '';
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}
