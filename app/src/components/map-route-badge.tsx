import type { ComponentType, CSSProperties, SVGProps } from 'react';
import { Drive, Note, Transit, Walk } from '@/components/icons';
import type { Mode } from '@/lib/map-helpers';
import { formatDurationMin } from '@/lib/units';
import styles from './map-route-badge.module.css';

// The leg's capsule at the arc's middle (Google AdvancedMarker / MapLibre Marker
// content), in the leg's colour: mode icon · time · note mark · › when labelled
// (the leg is long enough on screen), else icon + › (TP-0152). Decorative unless
// interactive: then a tap opens the leg's sheet.

const MODE_ICON: Record<Mode, ComponentType<SVGProps<SVGSVGElement>>> = {
  walk: Walk,
  drive: Drive,
  transit: Transit,
};

type Props = {
  mode: Mode;
  color: string;
  /** The leg's destination pin id (`data-leg-to`). */
  toId: string;
  interactive?: boolean;
  /** MapLibre + interactive: the badge is a button with this name. Google names the AdvancedMarker instead. */
  name?: string;
  /** Shown (labelled only) when > 0. */
  durationMin?: number | null;
  /** The leg has a note: a note mark (labelled only). */
  hasNote?: boolean;
  /** Full capsule; false = icon + › (short on screen at this zoom). */
  labelled?: boolean;
  /** The leg into the selected stop (`data-active`). */
  active?: boolean;
};

export function RouteBadge({
  mode,
  color,
  toId,
  interactive = false,
  name,
  durationMin,
  hasNote = false,
  labelled = false,
  active = false,
}: Props) {
  const Icon = MODE_ICON[mode];
  const common = {
    'data-route-badge': mode,
    'data-leg-to': toId,
    'data-interactive': interactive ? '' : undefined,
    'data-active': active ? '' : undefined,
    'data-labelled': labelled ? '' : undefined,
    className: styles.capsule,
    style: { '--badge': color } as CSSProperties,
  };
  const body = (
    <>
      <Icon strokeWidth={2} className={styles.mode} aria-hidden />
      {labelled && durationMin != null && durationMin > 0 && (
        <span className={styles.time}>{formatDurationMin(durationMin)}</span>
      )}
      {labelled && hasNote && (
        <span className={styles.note}>
          <Note aria-hidden />
        </span>
      )}
      <span className={styles.chevron} aria-hidden>
        ›
      </span>
    </>
  );
  // Out of the Tab order: the destination's own pin is the keyboard path.
  return interactive && name ? (
    <button type="button" tabIndex={-1} aria-label={name} {...common}>
      {body}
    </button>
  ) : (
    <div aria-hidden {...common}>
      {body}
    </div>
  );
}
