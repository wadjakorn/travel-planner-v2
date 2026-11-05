// Initials + a stable colour for a member avatar. Shared by the trip header and
// the home trip cards (TP-0115) so a member looks the same everywhere.

export function initialsOf(name?: string | null, email?: string | null): string {
  const src = (name ?? email ?? '?').trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 55%, 55%)`;
}
