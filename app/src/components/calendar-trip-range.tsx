// Trip-range calendar body: one column per trip day (plus "Before trip" /
// "After trip" edge days when bookings fall there). One DOM for both layouts:
// stacked full-width sections below md, a horizontally scrolling column strip
// from md up.

import Link from 'next/link';
import type {
  TripRangeColumn,
  TripRangeOutside,
} from '@/lib/calendar-trip-range';
import { getLang, tFor, tServer } from '@/lib/i18n';
import { pluralKey } from '@/lib/i18n-client';

type T = ReturnType<typeof tFor>;

type Props = {
  tripId: string;
  columns: TripRangeColumn[];
  outside: TripRangeOutside;
  todayIso: string;
  locale: string;
};

export async function CalendarTripRange({
  tripId,
  columns,
  outside,
  todayIso,
  locale,
}: Props) {
  const [t, lang] = await Promise.all([tServer(), getLang()]);
  return (
    <div>
      <ol className="flex flex-col gap-2 md:grid md:snap-x md:auto-cols-[minmax(11rem,1fr)] md:grid-flow-col md:overflow-x-auto md:pb-2">
        {columns.map((c) => (
          <li key={c.iso} className="md:snap-start">
            <Column tripId={tripId} col={c} todayIso={todayIso} locale={locale} t={t} />
          </li>
        ))}
      </ol>
      {outside.count > 0 && outside.firstIso ? (
        <p className="mt-3 text-sm text-muted">
          {t(pluralKey(lang, 'cal_outside', outside.count), { n: outside.count })} ·{' '}
          <Link
            href={`/trip/${tripId}/calendar?view=month&ym=${outside.firstIso.slice(0, 7)}`}
            className="font-medium text-foreground underline underline-offset-2"
          >
            {t('cal_month_view')}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function Column({
  tripId,
  col,
  todayIso,
  locale,
  t,
}: {
  tripId: string;
  col: TripRangeColumn;
  todayIso: string;
  locale: string;
  t: T;
}) {
  const date = new Date(col.iso + 'T00:00:00Z');
  const weekday = date.toLocaleDateString(locale, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const monthShort = date.toLocaleDateString(locale, {
    month: 'short',
    timeZone: 'UTC',
  });
  const dayNum = date.getUTCDate();
  const isToday = col.iso === todayIso;
  const headingId = `cal-col-${col.iso}`;
  const empty =
    col.bookings.length === 0 && col.stops.length === 0 && col.moreStops === 0;

  return (
    <section
      aria-labelledby={headingId}
      className={`flex h-full flex-col gap-2 rounded-xl border p-3 ${
        col.edge ? 'border-border bg-surface-2' : 'border-border bg-surface'
      }`}
    >
      <header>
        {col.edge ? (
          <div className="text-xs font-medium uppercase tracking-wide text-muted">
            {col.edge === 'before' ? t('cal_before_trip') : t('cal_after_trip')}
          </div>
        ) : null}
        <h3
          id={headingId}
          className={`flex items-center gap-1.5 text-sm font-semibold ${
            col.edge ? 'text-muted' : 'text-foreground'
          }`}
        >
          <span>{weekday}</span>
          <span
            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-full text-base ${
              isToday ? 'bg-brand px-1 text-brand-foreground' : ''
            }`}
          >
            {dayNum}
          </span>
          <span>{monthShort}</span>
          {isToday ? <span className="sr-only">{t('cal_today_sr')}</span> : null}
        </h3>
        {col.day ? (
          <Link
            href={`/trip/${tripId}?day=${col.day.idx}`}
            className="flex min-h-11 items-center text-sm font-medium text-foreground underline-offset-2 hover:underline md:min-h-8"
          >
            {t('cal_day_title', { n: col.day.idx + 1, title: col.day.title })}
          </Link>
        ) : null}
      </header>

      {col.bookings.length > 0 ? (
        <ul className="space-y-1">
          {col.bookings.map((e) => (
            <li key={e.id}>
              <Link
                href={e.href}
                className="flex min-h-11 items-center gap-2 rounded-lg border-l-4 px-2.5 py-1.5 text-xs font-medium leading-snug md:min-h-9"
                style={{
                  background: e.color + '18',
                  color: e.color,
                  borderLeftColor: e.color,
                }}
                title={e.label}
              >
                {e.time ? (
                  <span className="shrink-0 font-mono tabular-nums">{e.time}</span>
                ) : null}
                <span className="min-w-0 truncate">{e.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {col.stops.length > 0 ? (
        <ol className="space-y-1">
          {col.stops.map((s) => (
            <li key={s.id} className="flex gap-2 text-sm leading-snug text-foreground">
              {s.time ? (
                <span className="shrink-0 pt-px font-mono text-xs tabular-nums text-muted">
                  {s.time}
                </span>
              ) : null}
              <span className="min-w-0 break-words">{s.name}</span>
            </li>
          ))}
        </ol>
      ) : null}

      {col.moreStops > 0 && col.day ? (
        <Link
          href={`/trip/${tripId}?day=${col.day.idx}`}
          className="flex min-h-11 items-center text-xs font-medium text-muted underline-offset-2 hover:text-foreground hover:underline md:min-h-8"
        >
          {t('cal_more', { n: col.moreStops })}
        </Link>
      ) : null}

      {empty ? <p className="text-xs text-muted">{t('cal_nothing_planned')}</p> : null}
    </section>
  );
}
