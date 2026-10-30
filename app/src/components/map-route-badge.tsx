import type { ComponentType, CSSProperties, SVGProps } from 'react';
import { Drive, Transit, Walk } from '@/components/icons';
import type { Mode } from '@/lib/map-helpers';
import styles from './map-route-badge.module.css';

// Leg mode at the arc's middle, in the leg's colour (Google AdvancedMarker / MapLibre Marker
// content). Decorative: the list row already names the mode.

const MODE_ICON: Record<Mode, ComponentType<SVGProps<SVGSVGElement>>> = {
  walk: Walk,
  drive: Drive,
  transit: Transit,
};

export function RouteBadge({ mode, color }: { mode: Mode; color: string }) {
  const Icon = MODE_ICON[mode];
  return (
    <div className={styles.badge} style={{ '--badge': color } as CSSProperties} aria-hidden>
      <Icon strokeWidth={2} />
    </div>
  );
}
