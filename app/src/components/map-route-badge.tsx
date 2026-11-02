import type { ComponentType, CSSProperties, SVGProps } from 'react';
import { Drive, Transit, Walk } from '@/components/icons';
import type { Mode } from '@/lib/map-helpers';
import styles from './map-route-badge.module.css';

// Leg mode at the arc's middle, in the leg's colour (Google AdvancedMarker / MapLibre Marker
// content). Decorative unless interactive: then a tap selects the leg's destination.

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
};

export function RouteBadge({ mode, color, toId, interactive = false, name }: Props) {
  const Icon = MODE_ICON[mode];
  const common = {
    'data-route-badge': mode,
    'data-leg-to': toId,
    'data-interactive': interactive ? '' : undefined,
    className: styles.badge,
    style: { '--badge': color } as CSSProperties,
  };
  // Out of the Tab order: the destination's own pin is the keyboard path.
  return interactive && name ? (
    <button type="button" tabIndex={-1} aria-label={name} {...common}>
      <Icon strokeWidth={2} />
    </button>
  ) : (
    <div aria-hidden {...common}>
      <Icon strokeWidth={2} />
    </div>
  );
}
