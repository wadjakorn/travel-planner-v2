// Sub-nav under Header for switching between itinerary / hotels /
// transport / budget / notes views of a single trip. Phase 3A wires
// itinerary + hotels + transport. Phase 5/6 add budget + notes.

import Link from 'next/link';
import { MapPin, Bed, Plane } from '@/components/icons';

type Tab = 'itinerary' | 'hotels' | 'transport';

type Props = {
  tripId: string;
  active: Tab;
};

const TABS: Array<{ id: Tab; label: string; href: (id: string) => string }> = [
  { id: 'itinerary', label: 'Itinerary', href: (id) => `/trip/${id}` },
  { id: 'hotels', label: 'Hotels', href: (id) => `/trip/${id}/hotels` },
  { id: 'transport', label: 'Transport', href: (id) => `/trip/${id}/transport` },
];

export function TripNav({ tripId, active }: Props) {
  return (
    <nav className="border-b border-zinc-200 bg-white px-6 dark:border-zinc-800 dark:bg-zinc-950">
      <ul className="-mb-px flex gap-2">
        {TABS.map((t) => (
          <li key={t.id}>
            <Link
              href={t.href(tripId)}
              className={
                t.id === active
                  ? 'inline-flex items-center gap-2 border-b-2 border-zinc-900 px-3 py-3 text-sm font-medium text-zinc-900 dark:border-zinc-50 dark:text-zinc-50'
                  : 'inline-flex items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50'
              }
            >
              {iconFor(t.id)}
              {t.label}
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
    case 'hotels':
      return <Bed width={16} height={16} />;
    case 'transport':
      return <Plane width={16} height={16} />;
  }
}
