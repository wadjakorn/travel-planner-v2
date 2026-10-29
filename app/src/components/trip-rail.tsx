// Left vertical rail for trip pages — icon-only nav matching the
// design mockup. Rendered once by the trip layout so it stays mounted (and
// visible next to the loading skeleton) across sub-page navigation; the
// active item is derived client-side from the selected segment.

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
import { TripRailFrame, TripRailLink, type TripRailSegment } from './trip-rail-frame';
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
        const badge = id === 'bookings' ? counts.hotels + counts.transport : 0;
        const label = t(item.i18nKey);
        if (item.disabled) {
          return (
            <span
              key={id}
              aria-label={`${label} (coming soon)`}
              aria-disabled="true"
              title={`${label} — coming soon`}
              className="relative inline-flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-xl text-muted/40"
            >
              <item.Icon width={20} height={20} />
            </span>
          );
        }
        return (
          <TripRailLink
            key={id}
            segment={id}
            href={item.href(tripId)}
            label={label}
          >
            <item.Icon width={20} height={20} />
            {badge > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold leading-[18px] text-background ring-2 ring-surface">
                {badge > 99 ? '99+' : badge}
              </span>
            ) : null}
          </TripRailLink>
        );
      })}
    </TripRailFrame>
  );
}
