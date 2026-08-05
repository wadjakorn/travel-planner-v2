// Left vertical rail for trip pages — icon-only nav matching the
// design mockup. Server component; each child page passes its own
// `active` segment.

import Link from 'next/link';
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
import { TripRailFrame } from './trip-rail-frame';

export type TripRailKey =
  | 'itinerary'
  | 'calendar'
  | 'bookings'
  | 'budget'
  | 'notes'
  | 'settings';

type Item = {
  id: TripRailKey;
  i18nKey: MessageKey;
  href: (id: string) => string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  badge?: number;
  disabled?: boolean; // FUTURE ENHANCE: ship notes
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
  active: TripRailKey;
  counts: { hotels: number; transport: number };
  showSettings?: boolean;
};

export async function TripRail({
  tripId,
  active,
  counts,
  showSettings = true,
}: Props) {
  // Settings is owner-only (the page notFound()s for everyone else), so the
  // rail resolves ownership itself rather than trusting six call sites to
  // remember to pass it.
  const [t, isOwner] = await Promise.all([tServer(), isTripOwner(tripId)]);
  const items: Item[] = [
    { id: 'itinerary', i18nKey: 'itinerary', href: (id) => `/trip/${id}`, Icon: MapPin },
    { id: 'calendar', i18nKey: 'calendar', href: (id) => `/trip/${id}/calendar`, Icon: Clock },
    { id: 'bookings', i18nKey: 'bookings', href: (id) => `/trip/${id}/bookings`, Icon: Bed, badge: counts.hotels + counts.transport },
    { id: 'budget', i18nKey: 'budget', href: (id) => `/trip/${id}/budget`, Icon: Wallet },
    { id: 'notes', i18nKey: 'notes', href: (id) => `/trip/${id}/notes`, Icon: Note, disabled: true },
  ];
  if (showSettings && isOwner) {
    items.push({
      id: 'settings',
      i18nKey: 'settings',
      href: (id) => `/trip/${id}/settings`,
      Icon: Settings,
    });
  }

  return (
    <TripRailFrame>
      {items.map((item) => {
        const isActive = item.id === active;
        const label = t(item.i18nKey);
        if (item.disabled) {
          return (
            <span
              key={item.id}
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
          <Link
            key={item.id}
            href={item.href(tripId)}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            title={label}
            className={
              'relative inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ' +
              (isActive
                ? 'bg-brand text-brand-foreground shadow-sm'
                : 'text-muted hover:bg-surface-2 hover:text-foreground')
            }
          >
            <item.Icon width={20} height={20} />
            {item.badge && item.badge > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-semibold leading-[18px] text-background ring-2 ring-surface">
                {item.badge > 99 ? '99+' : item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </TripRailFrame>
  );
}
