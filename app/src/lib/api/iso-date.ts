// Shared real-calendar YYYY-MM-DD check for the /api/v1 input parsers. Rejects
// well-formed-but-impossible dates like 2026-02-31, which `new Date` would
// otherwise silently roll over into March. Used by both the import trip/day
// date validation (import-input) and the hotel date validation (hotel-input)
// so the two can never diverge.
export function isRealISODate(s: string): boolean {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}
