'use client';

// Client-side search + sort over the trips grid. Data is fetched server-side
// and passed in; filtering/sorting is purely presentational (no refetch).

import { useMemo, useState } from 'react';
import { TripCard } from '@/components/trip-card';
import { Input, Select } from '@/components/ui';
import { Search } from '@/components/icons';

type TripItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  cover?: string | null;
  daysCount: number;
  placesCount: number;
  collaborators?: Array<{ initials: string; color: string }> | null;
};

type SortKey = 'recent' | 'name' | 'date';

type Props = {
  trips: TripItem[];
  onDelete?: (formData: FormData) => Promise<void>;
};

export function TripsBrowser({ trips, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('recent');

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = trips;
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.subtitle ?? '').toLowerCase().includes(q),
      );
    }
    if (sort === 'name') {
      list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    } else if (sort === 'date') {
      // Upcoming first: earliest start date, undated trips last.
      list = [...list].sort((a, b) => {
        if (!a.startDate) return 1;
        if (!b.startDate) return -1;
        return a.startDate.localeCompare(b.startDate);
      });
    }
    return list;
  }, [trips, query, sort]);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            width={16}
            height={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search trips…"
            aria-label="Search trips"
            className="pl-9"
          />
        </div>
        <Select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort trips"
          className="sm:w-44"
        >
          <option value="recent">Recently added</option>
          <option value="date">Date (upcoming first)</option>
          <option value="name">Name (A–Z)</option>
        </Select>
      </div>

      {/* Results region is always a full-width block so the container width
          stays constant whether 0, 1, or many trips match (the grid keeps its
          fixed column tracks, so a single card aligns left instead of the
          layout shrinking to fit one card). */}
      <div className="mt-6 w-full">
        {shown.length === 0 ? (
          <p className="mt-4 text-center text-sm text-muted">
            No trips match “{query}”.
          </p>
        ) : (
          <div className="grid w-full grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((trip) => (
              <TripCard key={trip.id} trip={trip} onDelete={onDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
