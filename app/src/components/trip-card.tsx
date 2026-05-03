// TripCard — renders one trip as a clickable grid card.
// Server component; no 'use client'.

import Link from 'next/link';
import { Trash } from '@/components/icons';
import styles from './trip-card.module.css';

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

// ─── Cover fallback SVG (matches TripCover gradient palette) ─────────────────

function CoverFallback() {
  return (
    <svg
      className={styles.coverSvg}
      viewBox="0 0 320 148"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="tc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbeee0" />
          <stop offset="50%" stopColor="#fde8e1" />
          <stop offset="100%" stopColor="#e8d5e8" />
        </linearGradient>
        <linearGradient id="tc-far" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a8b8c9" />
          <stop offset="100%" stopColor="#8a9bad" />
        </linearGradient>
        <linearGradient id="tc-mid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7a8b9e" />
          <stop offset="100%" stopColor="#5e6f82" />
        </linearGradient>
      </defs>
      <rect width="320" height="148" fill="url(#tc-sky)" />
      <circle cx="250" cy="44" r="16" fill="#ffd49a" opacity="0.7" />
      <path d="M0 106 L86 44 Q100 30 114 44 L200 106 Z" fill="url(#tc-far)" />
      <path
        d="M80 54 L100 30 L120 54 L112 56 L106 50 L100 56 L94 50 L88 56 Z"
        fill="#ffffff"
        opacity="0.95"
      />
      <path
        d="M0 118 L54 90 L108 106 L160 86 L214 106 L268 94 L320 106 L320 148 L0 148 Z"
        fill="url(#tc-mid)"
        opacity="0.8"
      />
      <g opacity="0.9">
        <ellipse cx="40" cy="128" rx="40" ry="16" fill="#f4c5d3" />
        <ellipse cx="286" cy="132" rx="34" ry="14" fill="#f4c5d3" />
        <ellipse cx="160" cy="140" rx="54" ry="12" fill="#eda5be" />
      </g>
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TripCard({ trip, onDelete }: Props) {
  const {
    id,
    title,
    subtitle,
    startDate,
    endDate,
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

  return (
    <div style={{ position: 'relative' }}>
      {/* Delete form sits outside <Link> to avoid nested-interactive violation */}
      {onDelete && (
        <form action={onDelete} style={{ position: 'absolute', top: 10, right: 10, zIndex: 2 }}>
          <input type="hidden" name="tripId" value={id} />
          <button
            type="submit"
            className={styles.deleteBtn}
            title="Delete trip"
            aria-label="Delete trip"
          >
            <Trash />
          </button>
        </form>
      )}

      <Link href={`/trip/${id}`} className={styles.card}>
        {/* Cover */}
        <div className={styles.cover}>
          <CoverFallback />
        </div>

        {/* Body */}
        <div className={styles.body}>
          <h3 className={styles.title}>{title}</h3>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          <p className={styles.meta}>{metaParts.join(' · ')}</p>

          {visibleCollabs.length > 0 && (
            <div className={styles.avatars}>
              {visibleCollabs.map((c, i) => (
                <span
                  key={i}
                  className={styles.avatar}
                  style={{ background: c.color }}
                  title={c.initials}
                >
                  {c.initials}
                </span>
              ))}
              {overflow > 0 && (
                <span className={`${styles.avatar} ${styles.avatarOverflow}`}>
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
