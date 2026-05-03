// Itinerary view for a single trip. Phase 2A read-only port; Phase 2C/D/E
// add day + place CRUD and reorder/optimize logic.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { Header } from '@/components/header';
import { TripCover } from '@/components/trip-cover';
import { DayHeader } from '@/components/day-header';
import { OptimizeStrip } from '@/components/optimize-strip';
import { PlaceRow } from '@/components/place-row';
import { Segment } from '@/components/segment';
import MapCanvas from '@/components/map-canvas';
import { loadTrip } from '@/lib/trip-queries';
import { removePlaceAction } from '@/app/actions/places';
import { Plus, Edit, Trash } from '@/components/icons';

type RouteParams = Promise<{ id: string }>;
type SearchParams = Promise<{ day?: string }>;

export default async function TripPage({
  params,
  searchParams,
}: {
  params: RouteParams;
  searchParams: SearchParams;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id } = await params;
  const trip = await loadTrip(id);
  if (!trip) notFound();
  // Owner-only access for now. Phase 8 layers in trip_membership.
  if (trip.ownerId !== user.id) notFound();

  const sp = await searchParams;
  const requestedIdx = Number(sp.day);
  const activeIdx =
    Number.isFinite(requestedIdx) &&
    requestedIdx >= 0 &&
    requestedIdx < trip.days.length
      ? requestedIdx
      : 0;
  const activeDay = trip.days[activeIdx];

  return (
    <>
      <Header user={user} />
      <div className="grid min-h-[calc(100vh-56px)] grid-cols-1 lg:grid-cols-[minmax(360px,440px)_1fr]">
        <aside className="overflow-y-auto border-r border-zinc-200 dark:border-zinc-800">
          <TripCover
            title={trip.title}
            subtitle={trip.subtitle}
            dates={`${formatDate(trip.startDate)} – ${formatDate(trip.endDate)}`}
            daysCount={trip.days.length}
            travelers={(trip.collaborators?.length ?? 0) + 1}
            cover={trip.cover}
          />
          <DayHeader
            days={trip.days.map((d) => ({
              id: d.id,
              idx: d.idx,
              label: d.label,
              num: d.num,
            }))}
            activeIdx={activeIdx}
            activeDayId={activeDay?.id}
            activeDay={{
              title: activeDay?.title ?? '',
              summaryDistance: activeDay?.summaryDistance ?? null,
              summaryTime: activeDay?.summaryTime ?? null,
            }}
            tripId={trip.id}
          />
          <OptimizeStrip
            savings={
              activeDay?.optimizeSavingsTime
                ? {
                    time: activeDay.optimizeSavingsTime,
                    swap: activeDay.optimizeSavingsSwap ?? '',
                  }
                : null
            }
          />
          <div className="flex flex-col">
            {activeDay?.places.map((place, i) => (
              <div key={place.id} className="group relative">
                <PlaceRow idx={place.idx + 1} place={place} />
                <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Link
                    href={`/trip/${trip.id}/place/${place.id}/edit`}
                    aria-label={`Edit ${place.name}`}
                    className="rounded-full p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                  >
                    <Edit width={16} height={16} />
                  </Link>
                  <form action={removePlaceAction}>
                    <input type="hidden" name="placeId" value={place.id} />
                    <button
                      type="submit"
                      aria-label={`Remove ${place.name}`}
                      className="rounded-full p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
                    >
                      <Trash width={16} height={16} />
                    </button>
                  </form>
                </div>
                {activeDay.segments[i] ? (
                  <Segment
                    mode={activeDay.segments[i].mode}
                    distance={activeDay.segments[i].distance}
                    time={activeDay.segments[i].time}
                    from={place}
                    to={activeDay.places[i + 1] ?? null}
                  />
                ) : null}
              </div>
            ))}
            {activeDay ? (
              <Link
                href={`/trip/${trip.id}/day/${activeDay.id}/place/new`}
                className="mx-4 my-3 inline-flex items-center gap-2 rounded-full border border-dashed border-zinc-300 px-4 py-2.5 text-sm text-zinc-600 hover:border-zinc-900 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-50 dark:hover:text-zinc-50"
              >
                <Plus width={14} height={14} />
                Add place
              </Link>
            ) : null}
          </div>
        </aside>
        <section className="relative bg-zinc-50 dark:bg-zinc-950">
          {activeDay ? (
            <MapCanvas
              dayLabel={`Day ${activeDay.idx + 1} · ${activeDay.label} ${activeDay.num}`}
              totalDistance={activeDay.summaryDistance}
              totalTime={activeDay.summaryTime}
              pins={activeDay.places.map((p) => ({
                id: p.id,
                idx: p.idx + 1,
                kind: p.kind,
                x: p.x ?? 500,
                y: p.y ?? 350,
                name: p.name,
              }))}
            />
          ) : null}
        </section>
      </div>
    </>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
