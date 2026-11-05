// Readable per-day summary for the MCP `get_trip` tool / trip:// resource
// (TP-0035 design §4). Pure over the GET /trips/:id shape (loadApiTrip, with
// TP-0149 est* on each arrive).

import { dayHotels, driveMinutesForDay, LONG_DRIVE_DAY_MIN, type HotelLike } from '@/lib/leg-estimate';

type Mode = 'drive' | 'walk' | 'transit';
type Arrive = { mode: Mode; durationMin: number | null; estDistanceKm?: number | null } | null;
type SummaryPlace = { name: string; lat: number | null; lng: number | null; arrive: Arrive };
type SummaryDay = { date?: string | null; dateIso?: string | null; title?: string | null; places: SummaryPlace[] };
type SummaryHotel = HotelLike & { name?: string | null; status?: string | null; area?: string | null };
export type SummaryTrip = {
  id: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  updatedAt?: string | Date | null;
  days: SummaryDay[];
  hotels?: SummaryHotel[];
};

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function daySummaryLine(day: SummaryDay, i: number, isLast: boolean, hotels: SummaryHotel[]): string {
  const parts = [`Day ${i + 1}`];
  if (day.date) parts.push(day.date);
  if (day.title) parts.push(day.title);
  const n = day.places.length;
  parts.push(`${n} stop${n === 1 ? '' : 's'}`);

  const km = day.places.reduce((s, p) => s + (p.arrive?.mode === 'drive' ? (p.arrive.estDistanceKm ?? 0) : 0), 0);
  const drive = driveMinutesForDay(day.places, day.places.map((p) => p.arrive), hotels, day.dateIso ?? null);
  if (drive > 0) parts.push(`drive ~${Math.round(km)} km / ~${fmtMinutes(drive)}`);

  const { end } = dayHotels(hotels, day.dateIso ?? null);
  const endHotel = end as SummaryHotel | null;
  if (endHotel) parts.push(`hotel: ${endHotel.name || endHotel.area || 'unnamed'}${endHotel.status === 'tbd' ? ' (tbd)' : ''}`);

  const flags: string[] = [];
  if (!endHotel && !isLast) flags.push('no hotel tonight');
  const unpinned = day.places.filter((p) => p.lat == null || p.lng == null).length;
  if (unpinned) flags.push(`${unpinned} stop${unpinned === 1 ? '' : 's'} without a pin`);
  if (drive > LONG_DRIVE_DAY_MIN) flags.push('long drive');
  if (flags.length) parts.push(`⚠ ${flags.join(', ')}`);
  return parts.join(' · ');
}

export function tripSummary(trip: SummaryTrip): string {
  const hotels = trip.hotels ?? [];
  const head = `# ${trip.title}` + (trip.startDate ? ` (${trip.startDate} → ${trip.endDate ?? '?'})` : '');
  const lines = trip.days.map((d, i) => `- ${daySummaryLine(d, i, i === trip.days.length - 1, hotels)}`);
  const ver = trip.updatedAt ? `\n\nupdatedAt: ${new Date(trip.updatedAt).toISOString()}` : '';
  return `${head}\n\n${lines.join('\n') || '- (no days yet)'}${ver}`;
}
