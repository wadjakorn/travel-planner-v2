// Pure date helpers for the free-text date columns on bookings.
//
// Kept in their own module, with no DB import, so anything that needs them —
// including unit tests — does not drag `@/db` (and therefore a DATABASE_URL)
// into scope just to parse a string.

export function parseLooseDate(s: string | null): string | null {
  if (!s) return null;
  // ISO already?
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
