// Phase 7A — read-only month calendar. Trip days highlighted; booking
// events plotted; legend + month nav. Drag-reschedule = Phase 7B.
//
// Two layouts share one data pass:
//  - < md: a compact month grid (numbers + colour dots, no text) that anchors
//    down to a full-width agenda list. A 7-column grid on a 360px screen gives
//    each cell ~45px, which truncates every chip label to nothing.
//  - >= md: the original month grid with inline event chips.

import Link from 'next/link';
import type { CalendarEvent, ItineraryDay } from '@/lib/calendar-queries';

type Props = {
  tripId: string;
  year: number;
  month: number; // 1-12
  tripStart: string | null; // YYYY-MM-DD
  tripEnd: string | null;
  events: CalendarEvent[];
  itinerary: ItineraryDay[];
  todayIso: string; // YYYY-MM-DD in user's locale (server "today")
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function CalendarView({
  tripId,
  year,
  month,
  tripStart,
  tripEnd,
  events,
  itinerary,
  todayIso,
}: Props) {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const startDow = monthStart.getUTCDay(); // 0 = Sun
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthLabel = monthStart.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const monthShort = monthStart.toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });

  const cells: Array<number | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDate = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const arr = eventsByDate.get(e.date) ?? [];
    arr.push(e);
    eventsByDate.set(e.date, arr);
  }

  const dayByDate = new Map<string, ItineraryDay>();
  for (const d of itinerary) dayByDate.set(d.date, d);

  const tripStartIso = tripStart;
  const tripEndIso = tripEnd;

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const todayHref =
    tripStart && tripEnd
      ? `/trip/${tripId}/calendar?ym=${tripStart.slice(0, 7)}`
      : `/trip/${tripId}/calendar`;

  // Every day of this month that has something to read, in date order. Drives
  // the mobile agenda and tells the compact grid which cells are anchors.
  const agenda = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${pad(year)}-${pad(month)}-${pad(d)}`;
    const evts = eventsByDate.get(iso) ?? [];
    const itin = dayByDate.get(iso);
    if (!itin && evts.length === 0) continue;
    agenda.push({
      iso,
      day: d,
      dow: WEEKDAYS[new Date(iso + 'T00:00:00Z').getUTCDay()],
      evts,
      itin,
    });
  }

  const navBtn =
    'inline-flex h-10 min-w-10 items-center justify-center rounded-full border border-border px-3 text-sm text-foreground hover:bg-surface-2';

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6">
      <header className="mb-4">
        <div className="text-xs uppercase tracking-wide text-muted">When</div>
        <h1 className="text-2xl font-semibold text-foreground">Calendar</h1>
        {tripStart && tripEnd ? (
          <div className="text-sm text-muted">
            Trip · {formatRange(tripStart, tripEnd)}
          </div>
        ) : (
          // Without a start date there is nothing to anchor day 1 to, so the
          // itinerary cannot be placed on the calendar at all.
          <div className="text-sm text-muted">
            Set a trip start date to see your itinerary days here.
          </div>
        )}
      </header>

      <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Link
            href={`/trip/${tripId}/calendar?ym=${pad(prev.year)}-${pad(prev.month)}`}
            aria-label="Previous month"
            className={navBtn}
          >
            ‹
          </Link>
          <h2 className="text-lg font-semibold text-foreground">
            {monthLabel}
          </h2>
          <Link
            href={`/trip/${tripId}/calendar?ym=${pad(next.year)}-${pad(next.month)}`}
            aria-label="Next month"
            className={navBtn}
          >
            ›
          </Link>
          <span className="flex-1" />
          <Link href={todayHref} className={navBtn}>
            Trip dates
          </Link>
        </div>

        {/* Compact grid — phones. Numbers and colour dots only; tapping a day
            with content jumps to its agenda entry below. */}
        <div className="grid grid-cols-7 gap-1 md:hidden">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="pb-1 text-center text-[10px] font-medium uppercase tracking-wide text-muted"
            >
              {/* Two letters, not one: S/S and T/T are indistinguishable. */}
              {d.slice(0, 2)}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) return <div key={i} className="h-11" />;
            const iso = `${pad(year)}-${pad(month)}-${pad(d)}`;
            const inTrip =
              tripStartIso && tripEndIso
                ? iso >= tripStartIso && iso <= tripEndIso
                : false;
            const isToday = iso === todayIso;
            const evts = eventsByDate.get(iso) ?? [];
            const itin = dayByDate.get(iso);
            const hasContent = evts.length > 0 || itin !== undefined;
            // The dots carry no text, so the label is the only thing a screen
            // reader gets. Name the itinerary day too — an itinerary-only day
            // would otherwise announce as "0 bookings".
            const parts = [`${monthShort} ${d}`];
            if (itin) parts.push(`Day ${itin.idx + 1} · ${itin.title}`);
            if (evts.length > 0) {
              parts.push(
                `${evts.length} booking${evts.length === 1 ? '' : 's'}`,
              );
            }
            const inner = (
              <>
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold ${
                    isToday
                      ? 'bg-brand text-brand-foreground'
                      : 'text-foreground'
                  }`}
                >
                  {d}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {evts.slice(0, 3).map((e) => (
                    <span
                      key={e.id}
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: e.color }}
                    />
                  ))}
                </span>
              </>
            );
            const base = `flex h-11 flex-col items-center justify-center gap-1 rounded-lg border ${
              inTrip
                ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40'
                : 'border-transparent'
            }`;
            return hasContent ? (
              <a
                key={i}
                href={`#day-${iso}`}
                aria-label={parts.join(' — ')}
                className={`${base} hover:bg-surface-2`}
              >
                {inner}
              </a>
            ) : (
              <div key={i} className={base}>
                {inner}
              </div>
            );
          })}
        </div>

        {/* Agenda — phones. This is where labels are actually readable. */}
        <div className="mt-4 space-y-2 md:hidden">
          {agenda.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
              Nothing scheduled in {monthShort}.
            </p>
          ) : (
            agenda.map(({ iso, day, dow, evts, itin }) => {
              const inTrip =
                tripStartIso && tripEndIso
                  ? iso >= tripStartIso && iso <= tripEndIso
                  : false;
              return (
                <section
                  key={iso}
                  id={`day-${iso}`}
                  className={`flex scroll-mt-4 gap-3 rounded-xl border p-3 ${
                    inTrip
                      ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40'
                      : 'border-border bg-surface'
                  }`}
                >
                  <div className="w-9 shrink-0 text-center">
                    <div className="text-[10px] uppercase tracking-wide text-muted">
                      {dow}
                    </div>
                    <div
                      className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-base font-semibold ${
                        iso === todayIso
                          ? 'bg-brand text-brand-foreground'
                          : 'text-foreground'
                      }`}
                    >
                      {day}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {itin ? (
                      <Link
                        href={`/trip/${tripId}?day=${itin.idx}`}
                        className="block text-sm font-medium text-foreground"
                      >
                        Day {itin.idx + 1} · {itin.title}
                        {itin.placeCount > 0 ? (
                          <span className="text-muted">
                            {' '}
                            · {itin.placeCount} place
                            {itin.placeCount === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </Link>
                    ) : null}
                    {evts.map((e) => (
                      <Link
                        key={e.id}
                        href={e.href}
                        className="block rounded-lg border-l-4 px-2.5 py-2 text-sm font-medium leading-snug"
                        style={{
                          background: e.color + '18',
                          color: e.color,
                          borderLeftColor: e.color,
                        }}
                      >
                        {e.label}
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>

        {/* Full grid — sm and up. */}
        <div className="hidden grid-cols-7 gap-1 md:grid">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted"
            >
              {d}
            </div>
          ))}
          {cells.map((d, i) => {
            if (d === null) {
              return <div key={i} className="min-h-[88px]" />;
            }
            const iso = `${pad(year)}-${pad(month)}-${pad(d)}`;
            const inTrip =
              tripStartIso && tripEndIso
                ? iso >= tripStartIso && iso <= tripEndIso
                : false;
            const isToday = iso === todayIso;
            const evts = eventsByDate.get(iso) ?? [];
            const itin = dayByDate.get(iso);
            // Never emit ?day=NaN: fall back to the bookings list on any date
            // that has no itinerary day (outside the trip, or no start date).
            const moreHref = itin
              ? `/trip/${tripId}?day=${itin.idx}`
              : `/trip/${tripId}/bookings`;
            return (
              <div
                key={i}
                className={`flex min-h-[88px] flex-col gap-1 rounded-lg border p-1.5 text-xs ${
                  inTrip
                    ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40'
                    : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-xs font-semibold ${
                      isToday
                        ? 'rounded-full bg-brand px-1.5 py-0.5 text-brand-foreground'
                        : 'text-muted'
                    }`}
                  >
                    {d}
                  </span>
                </div>
                {itin ? (
                  <Link
                    href={`/trip/${tripId}?day=${itin.idx}`}
                    className="block truncate text-[10px] font-medium text-muted hover:text-foreground"
                    title={`Day ${itin.idx + 1} · ${itin.title}`}
                  >
                    {itin.title}
                    {itin.placeCount > 0 ? ` · ${itin.placeCount}` : ''}
                  </Link>
                ) : null}
                {evts.slice(0, 3).map((e) => (
                  <Link
                    key={e.id}
                    href={e.href}
                    className="block truncate rounded border-l-2 px-1.5 py-0.5 text-[11px] font-medium"
                    style={{
                      background: e.color + '18',
                      color: e.color,
                      borderLeftColor: e.color,
                    }}
                    title={e.label}
                  >
                    {e.label}
                  </Link>
                ))}
                {evts.length > 3 ? (
                  <Link
                    href={moreHref}
                    className="text-[10px] text-muted underline-offset-2 hover:text-foreground hover:underline"
                  >
                    +{evts.length - 3} more
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
          <Legend color="#5b3fd9" label="Hotel" />
          <Legend color="#0071e3" label="Flight" />
          <Legend color="#29a847" label="Train" />
          <Legend color="#ff9500" label="Car" />
          <Legend color="#0099a8" label="Ferry" />
          <span className="hidden flex-1 md:block" />
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40" />
            Trip days
          </span>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={{ background: color }}
      />
      {label}
    </span>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function prevMonth(y: number, m: number) {
  return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
}
function nextMonth(y: number, m: number) {
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}

function formatRange(start: string, end: string): string {
  const a = new Date(start + 'T00:00:00Z');
  const b = new Date(end + 'T00:00:00Z');
  const opts: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  };
  return `${a.toLocaleDateString('en-US', opts)} – ${b.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
}
