// TripCard — renders one trip as a clickable grid card.
// Server component; no 'use client'.

import Link from 'next/link';
import { Trash } from '@/components/icons';
import {
  coverGradient,
  coverGlyph,
  isImageCover,
  tripStatus,
  type TripStatus,
} from '@/lib/trip-card-art';

type Props = {
  trip: {
    id: string;
    title: string;
    subtitle?: string | null;
    startDate?: string | null; // ISO yyyy-mm-dd
    endDate?: string | null;
    cover?: string | null;
    daysCount: number;
    placesCount: number;
    collaborators?: Array<{ initials: string; color: string }> | null;
  };
  onDelete?: (formData: FormData) => Promise<void>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function formatDateRange(start?: string | null, end?: string | null): string {
  if (!start) return '';
  const [sy, sm, sd] = start.split('-').map(Number);
  const startStr = `${MONTH[sm - 1]} ${sd}`;
  if (!end) return startStr;
  const [ey, em, ed] = end.split('-').map(Number);
  const endStr = `${MONTH[em - 1]} ${ed}, ${ey}`;
  if (sy !== ey) return `${startStr}, ${sy} – ${endStr}`;
  if (sm !== em) return `${startStr} – ${endStr}`;
  return `${startStr}–${ed}, ${ey}`;
}

const STATUS_CHIP: Record<TripStatus, { label: string; cls: string }> = {
  upcoming: { label: 'Upcoming', cls: 'bg-brand text-brand-foreground' },
  ongoing: { label: 'Ongoing', cls: 'bg-success text-success-foreground' },
  past: { label: 'Past', cls: 'bg-black/55 text-white' },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function TripCard({ trip, onDelete }: Props) {
  const {
    id,
    title,
    subtitle,
    startDate,
    endDate,
    cover,
    daysCount,
    placesCount,
    collaborators,
  } = trip;

  const dateRange = formatDateRange(startDate, endDate);
  const metaParts = [
    `${daysCount} ${daysCount === 1 ? 'day' : 'days'}`,
    `${placesCount} ${placesCount === 1 ? 'stop' : 'stops'}`,
    ...(dateRange ? [dateRange] : []),
  ];

  const visibleCollabs = collaborators?.slice(0, 3) ?? [];
  const overflow = (collaborators?.length ?? 0) - visibleCollabs.length;

  const today = new Date().toISOString().slice(0, 10);
  const status = tripStatus(startDate, endDate, today);
  const useImage = isImageCover(cover);
  const coverKey = cover || subtitle || title;

  return (
    <div className="relative">
      {/* Delete form sits outside <Link> to avoid nested-interactive violation */}
      {onDelete && (
        <form action={onDelete} className="absolute right-2.5 top-2.5 z-[2]">
          <input type="hidden" name="tripId" value={id} />
          <button
            type="submit"
            title="Delete trip"
            aria-label="Delete trip"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/85 text-zinc-600 backdrop-blur transition-colors hover:bg-white hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash width={14} height={14} />
          </button>
        </form>
      )}

      <Link
        href={`/trip/${id}`}
        className="group block overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-[var(--shadow-sm)] transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {/* Cover */}
        <div
          className="relative h-36 overflow-hidden"
          style={useImage ? undefined : { background: coverGradient(coverKey) }}
        >
          {useImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover as string}
              alt={`${title} cover`}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <span
              aria-hidden="true"
              className="absolute inset-0 flex items-center justify-center text-6xl font-bold text-white/25 select-none"
            >
              {coverGlyph(title)}
            </span>
          )}

          {status && (
            <span
              className={`absolute left-3 top-3 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm backdrop-blur ${STATUS_CHIP[status].cls}`}
            >
              {STATUS_CHIP[status].label}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-4 pb-3 pt-3.5">
          <h3 className="truncate text-[17px] font-semibold tracking-tight text-foreground">
            {title}
          </h3>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-muted">{subtitle}</p>
          )}
          <p className="mt-2 text-xs font-medium text-muted">
            {metaParts.join(' · ')}
          </p>

          {visibleCollabs.length > 0 && (
            <div className="mt-3 flex items-center">
              {visibleCollabs.map((c, i) => (
                <span
                  key={i}
                  className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-surface text-[9px] font-bold text-white first:ml-0 -ml-1.5"
                  style={{ background: c.color }}
                  title={c.initials}
                >
                  {c.initials}
                </span>
              ))}
              {overflow > 0 && (
                <span className="-ml-1.5 inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-surface bg-surface-2 text-[9px] font-bold text-muted">
                  +{overflow}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
