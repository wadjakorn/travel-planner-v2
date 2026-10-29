// Trip nav — icon + 12px label per item: left rail md+, bottom bar mobile.
// Rendered once by the trip layout so it stays mounted (and visible next to
// the loading skeleton) across sub-page navigation; the active item is
// derived client-side from the selected segment.

import {
  MapPin,
  Bed,
  Wallet,
  Note,
  Clock,
  Settings,
} from '@/components/icons';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { tServer } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n-client';
import {
  TripRailDisabledItem,
  TripRailFrame,
  TripRailLink,
  type TripRailSegment,
} from './trip-rail-frame';
import { railItemIds } from './trip-rail-items';

type Item = {
  i18nKey: MessageKey;
  href: (id: string) => string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  disabled?: boolean; // FUTURE ENHANCE: ship notes
};

const ITEMS: Record<TripRailSegment, Item> = {
  itinerary: { i18nKey: 'itinerary', href: (id) => `/trip/${id}`, Icon: MapPin },
  calendar: { i18nKey: 'calendar', href: (id) => `/trip/${id}/calendar`, Icon: Clock },
  bookings: { i18nKey: 'bookings', href: (id) => `/trip/${id}/bookings`, Icon: Bed },
  budget: { i18nKey: 'budget', href: (id) => `/trip/${id}/budget`, Icon: Wallet },
  notes: { i18nKey: 'notes', href: (id) => `/trip/${id}/notes`, Icon: Note, disabled: true },
  settings: { i18nKey: 'settings', href: (id) => `/trip/${id}/settings`, Icon: Settings },
};

async function isTripOwner(tripId: string): Promise<boolean> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return false;
  const rows = await db
    .select({ ownerId: trips.ownerId })
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  return rows[0]?.ownerId === userId;
}

type Props = {
  tripId: string;
  counts: { hotels: number; transport: number };
  showSettings?: boolean;
};

export async function TripRail({
  tripId,
  counts,
  showSettings = true,
}: Props) {
  // Settings is owner-only (the page notFound()s for everyone else), so the
  // rail resolves ownership itself rather than trusting six call sites to
  // remember to pass it.
  const [t, isOwner] = await Promise.all([tServer(), isTripOwner(tripId)]);
  return (
    <TripRailFrame>
      {railItemIds({ isOwner, showSettings }).map((id) => {
        const item = ITEMS[id];
        const label = t(item.i18nKey);
        const icon = <item.Icon width={20} height={20} aria-hidden="true" />;
        if (item.disabled) {
          return <TripRailDisabledItem key={id} label={label} icon={icon} />;
        }
        return (
          <TripRailLink
            key={id}
            segment={id}
            href={item.href(tripId)}
            label={label}
            icon={icon}
            badge={id === 'bookings' ? counts.hotels + counts.transport : undefined}
          />
        );
      })}
    </TripRailFrame>
  );
}
