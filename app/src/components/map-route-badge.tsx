import type { ComponentType, SVGProps } from 'react';
import { Drive, Transit, Walk } from '@/components/icons';
import type { Mode } from '@/lib/map-helpers';
import styles from './map-route-badge.module.css';

// Leg mode at the arc's middle (Google AdvancedMarker / MapLibre Marker
// content). Decorative: the list row already names the mode.

const MODE_ICON: Record<Mode, ComponentType<SVGProps<SVGSVGElement>>> = {
  walk: Walk,
  drive: Drive,
  transit: Transit,
};

export function RouteBadge({ mode }: { mode: Mode }) {
  const Icon = MODE_ICON[mode];
  return (
    <div className={styles.badge} aria-hidden>
      <Icon strokeWidth={2} />
    </div>
  );
}
