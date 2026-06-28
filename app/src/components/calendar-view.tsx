// Phase 7A — read-only month calendar. Trip days highlighted; booking
// events plotted; legend + month nav. Drag-reschedule = Phase 7B.

import Link from 'next/link';
import type { CalendarEvent } from '@/lib/calendar-queries';

type Props = {
  tripId: string;
  year: number;
  month: number; // 1-12
  tripStart: string | null; // YYYY-MM-DD
  tripEnd: string | null;
  events: CalendarEvent[];
  todayIso: string; // YYYY-MM-DD in user's locale (server "today")
};

export function CalendarView({
  tripId,
  year,
  month,
  tripStart,
  tripEnd,
  events,
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

  const tripStartIso = tripStart;
  const tripEndIso = tripEnd;

  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);
  const todayHref =
    tripStart && tripEnd
      ? `/trip/${tripId}/calendar?ym=${tripStart.slice(0, 7)}`
      : `/trip/${tripId}/calendar`;

  return (
    <div className="px-6 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">
            When
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            Calendar
          </h1>
          {tripStart && tripEnd ? (
            <div className="text-sm text-muted">
              Trip · {formatRange(tripStart, tripEnd)}
            </div>
          ) : null}
        </div>
      </header>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <Link
            href={`/trip/${tripId}/calendar?ym=${pad(prev.year)}-${pad(prev.month)}`}
            aria-label="Previous month"
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            ‹
          </Link>
          <h2 className="text-lg font-semibold text-foreground">
            {monthLabel}
          </h2>
          <Link
            href={`/trip/${tripId}/calendar?ym=${pad(next.year)}-${pad(next.month)}`}
            aria-label="Next month"
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            ›
          </Link>
          <span className="flex-1" />
          <Link
            href={todayHref}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Trip dates
          </Link>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
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
                  <span className="text-[10px] text-muted">
                    +{evts.length - 3} more
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
          <Legend color="#5b3fd9" label="Hotel" />
          <Legend color="#0071e3" label="Flight" />
          <Legend color="#29a847" label="Train" />
          <Legend color="#ff9500" label="Car" />
          <Legend color="#0099a8" label="Ferry" />
          <span className="flex-1" />
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
