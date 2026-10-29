import type { TripRailSegment } from './trip-rail-frame';

// Settings is owner-only: its page notFound()s for everyone else.
export function railItemIds(o: { isOwner: boolean; showSettings: boolean }): TripRailSegment[] {
  const ids: TripRailSegment[] = ['itinerary', 'calendar', 'bookings', 'budget', 'notes'];
  if (o.showSettings && o.isOwner) ids.push('settings');
  return ids;
}
