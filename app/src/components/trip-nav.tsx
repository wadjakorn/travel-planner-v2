// Sub-nav under Header for switching between itinerary / hotels /
// transport / budget / notes views of a single trip. Phase 3A wires
// itinerary + hotels + transport. Phase 5/6 add budget + notes.

import Link from 'next/link';
import {
  MapPin,
  Bed,
  Plane,
  Wallet,
  Note,
  Clock,
  Settings,
} from '@/components/icons';
import { tServer } from '@/lib/i18n';
import type { MessageKey } from '@/lib/i18n-client';

type Tab =
  | 'itinerary'
  | 'calendar'
  | 'hotels'
  | 'transport'
  | 'budget'
  | 'notes'
  | 'settings';

type Props = {
  tripId: string;
  active: Tab;
};

const TABS: Array<{ id: Tab; key: MessageKey; href: (id: string) => string }> = [
  { id: 'itinerary', key: 'itinerary', href: (id) => `/trip/${id}` },
  { id: 'calendar', key: 'calendar', href: (id) => `/trip/${id}/calendar` },
  { id: 'hotels', key: 'hotels', href: (id) => `/trip/${id}/hotels` },
  { id: 'transport', key: 'transport', href: (id) => `/trip/${id}/transport` },
  { id: 'budget', key: 'budget', href: (id) => `/trip/${id}/budget` },
  { id: 'notes', key: 'notes', href: (id) => `/trip/${id}/notes` },
  { id: 'settings', key: 'settings', href: (id) => `/trip/${id}/settings` },
];

export async function TripNav({ tripId, active }: Props) {
  const t = await tServer();
  return (
    <nav className="border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
      <ul className="-mb-px flex gap-2">
        {TABS.map((tab) => (
          <li key={tab.id}>
            <Link
              href={tab.href(tripId)}
              className={
                tab.id === active
                  ? 'inline-flex items-center gap-2 border-b-2 border-zinc-900 px-3 py-3 text-sm font-medium text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
                  : 'inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50'
              }
            >
              {iconFor(tab.id)}
              {t(tab.key)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function iconFor(tab: Tab) {
  switch (tab) {
    case 'itinerary':
      return <MapPin width={16} height={16} />;
    case 'calendar':
      return <Clock width={16} height={16} />;
    case 'hotels':
      return <Bed width={16} height={16} />;
    case 'transport':
      return <Plane width={16} height={16} />;
    case 'budget':
      return <Wallet width={16} height={16} />;
    case 'notes':
      return <Note width={16} height={16} />;
    case 'settings':
      return <Settings width={16} height={16} />;
  }
}
