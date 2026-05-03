import { Camera, More } from '@/components/icons';
import styles from './itinerary-sidebar.module.css';

type Props = {
  title: string;
  subtitle?: string | null;
  dates: string;
  daysCount: number;
  travelers: number;
  cover?: string | null;
};

export function TripCover({ title, subtitle, dates, daysCount, travelers }: Props) {
  return (
    <div className={styles.cover}>
      {/* Fallback SVG illustration — replace with <Image> once real assets land */}
      <svg
        className={styles.coverImg}
        viewBox="0 0 480 180"
        preserveAspectRatio="xMidYMax slice"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="tp-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbeee0" />
            <stop offset="50%" stopColor="#fde8e1" />
            <stop offset="100%" stopColor="#e8d5e8" />
          </linearGradient>
          <linearGradient id="tp-far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a8b8c9" />
            <stop offset="100%" stopColor="#8a9bad" />
          </linearGradient>
          <linearGradient id="tp-mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a8b9e" />
            <stop offset="100%" stopColor="#5e6f82" />
          </linearGradient>
        </defs>
        <rect width="480" height="180" fill="url(#tp-sky)" />
        {/* sun */}
        <circle cx="370" cy="58" r="22" fill="#ffd49a" opacity="0.7" />
        {/* far peak */}
        <path d="M0 130 L130 60 Q150 40 170 60 L300 130 Z" fill="url(#tp-far)" />
        <path
          d="M120 70 L150 40 L180 70 L168 72 L160 64 L150 70 L140 64 L130 72 Z"
          fill="#ffffff"
          opacity="0.95"
        />
        {/* mid hills */}
        <path
          d="M0 145 L80 110 L160 130 L240 105 L320 130 L400 115 L480 130 L480 180 L0 180 Z"
          fill="url(#tp-mid)"
          opacity="0.8"
        />
        {/* foreground blossoms */}
        <g opacity="0.9">
          <ellipse cx="60" cy="155" rx="60" ry="22" fill="#f4c5d3" />
          <ellipse cx="430" cy="160" rx="50" ry="20" fill="#f4c5d3" />
          <ellipse cx="240" cy="170" rx="80" ry="18" fill="#eda5be" />
        </g>
      </svg>

      <div className={styles.coverActions}>
        <button className={styles.coverBtn} title="Edit cover" type="button">
          <Camera />
        </button>
        <button className={styles.coverBtn} title="More" type="button">
          <More />
        </button>
      </div>

      <div className={styles.coverOverlay}>
        {subtitle && <div className={styles.coverEyebrow}>{subtitle}</div>}
        <h1 className={styles.coverTitle}>{title}</h1>
        <div className={styles.coverMeta}>
          {dates} · {daysCount} {daysCount === 1 ? 'day' : 'days'} · {travelers}{' '}
          {travelers === 1 ? 'traveler' : 'travelers'}
        </div>
      </div>
    </div>
  );
}
