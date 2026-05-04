import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { hotelBookings, transportBookings } from '@/db/schema';

export type CalendarEvent = {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'hotel' | 'flight' | 'train' | 'car' | 'ferry';
  label: string;
  color: string;
  href: string;
};

const COLORS = {
  hotel: '#5b3fd9',
  flight: '#0071e3',
  train: '#29a847',
  car: '#ff9500',
  ferry: '#0099a8',
} as const;

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

export async function loadCalendarEvents(
  tripId: string,
): Promise<CalendarEvent[]> {
  const [hotels, transport] = await Promise.all([
    db
      .select()
      .from(hotelBookings)
      .where(
        and(eq(hotelBookings.tripId, tripId), isNull(hotelBookings.deletedAt)),
      ),
    db
      .select()
      .from(transportBookings)
      .where(
        and(
          eq(transportBookings.tripId, tripId),
          isNull(transportBookings.deletedAt),
        ),
      ),
  ]);

  const events: CalendarEvent[] = [];
  for (const h of hotels) {
    const date = parseLooseDate(h.checkInDate);
    if (!date) continue;
    events.push({
      id: h.id,
      date,
      type: 'hotel',
      label: h.name,
      color: COLORS.hotel,
      href: `/trip/${tripId}/booking/hotel/${h.id}/edit`,
    });
  }
  for (const t of transport) {
    const date = parseLooseDate(t.fromDate);
    if (!date) continue;
    const type = t.type as 'flight' | 'train' | 'car' | 'ferry';
    events.push({
      id: t.id,
      date,
      type,
      label: t.title.split(' · ')[0] ?? t.title,
      color: COLORS[type] ?? '#888',
      href: `/trip/${tripId}/booking/transport/${t.id}/edit`,
    });
  }
  return events;
}
