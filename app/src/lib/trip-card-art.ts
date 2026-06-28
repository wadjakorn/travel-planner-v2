// Per-trip cover identity without a new entity. If a trip has a cover URL we
// use it; otherwise we derive a stable gradient + glyph from the trip's
// destination text so every card looks distinct (no clip-art repetition).

export type TripStatus = 'upcoming' | 'ongoing' | 'past';

// Curated, travel-flavored gradient pairs (light→deep). Picked by hash.
const GRADIENTS: ReadonlyArray<readonly [string, string]> = [
  ['#0ea5e9', '#2563eb'], // sky → blue
  ['#14b8a6', '#0f766e'], // teal (brand)
  ['#f59e0b', '#ea580c'], // amber → orange
  ['#ec4899', '#be185d'], // pink → rose
  ['#8b5cf6', '#6d28d9'], // violet
  ['#22c55e', '#15803d'], // green
  ['#06b6d4', '#0e7490'], // cyan
  ['#f43f5e', '#9f1239'], // red → maroon
  ['#6366f1', '#4338ca'], // indigo
  ['#eab308', '#a16207'], // gold
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function isImageCover(cover?: string | null): boolean {
  return !!cover && /^(https?:)?\/\//.test(cover);
}

/** CSS background for a trip's gradient cover, keyed by destination text. */
export function coverGradient(key: string): string {
  const [a, b] = GRADIENTS[hash(key || 'trip') % GRADIENTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

/** Single glyph shown over the gradient — first strong letter of the name. */
export function coverGlyph(title: string): string {
  const m = title.trim().match(/[\p{L}\p{N}]/u);
  return (m?.[0] ?? '✈').toUpperCase();
}

/** upcoming / ongoing / past from ISO yyyy-mm-dd dates vs today. */
export function tripStatus(
  start: string | null | undefined,
  end: string | null | undefined,
  todayISO: string,
): TripStatus | null {
  if (!start) return null;
  const endD = end ?? start;
  if (todayISO < start) return 'upcoming';
  if (todayISO > endD) return 'past';
  return 'ongoing';
}
