'use client';

import type { CSSProperties, ComponentType, SVGProps } from 'react';
import { Bed, Camera, Fork, Plus, Train } from '@/components/icons';
import { KIND_COLOR, type Pin } from '@/lib/map-helpers';
import { pinShape, pinTitle } from '@/lib/map-pin';
import { useT } from './i18n-provider';
import styles from './map-pin.module.css';

// Trip-map stop pin, shared by both renderers (review §7.2): a teardrop (stay =
// rounded square) in the kind color with its list number, a kind icon as the
// non-color cue, and — when active — rings plus a name label. Colors come from
// the light-locked `--map-pin-*` tokens, so pins look the same in dark mode.

const DROP = 'M18 43C18 43 3 27.5 3 17a15 15 0 0 1 30 0c0 10.5-15 26-15 26z';

const KIND_ICON: Record<Pin['kind'], ComponentType<SVGProps<SVGSVGElement>>> = {
  sight: Camera,
  food: Fork,
  hotel: Bed,
  transit: Train,
};

/**
 * `label` overrides the number (merged stops: `1 · 4`); longer than 2 chars
 * widens the shape. `name` overrides the interactive button's accessible name.
 * `highlight`: its itinerary row is hovered/focused — same lift as a pin hover.
 * `interactive` → a named `<button>` (MapLibre: the marker element itself is
 * not focusable). Otherwise an `aria-hidden` div: on Google the AdvancedMarker
 * is the focusable button and its `title` carries the same name.
 */
export function MapPin({
  pin,
  active = false,
  highlight = false,
  interactive = false,
  label,
  name,
}: {
  pin: Pin;
  active?: boolean;
  highlight?: boolean;
  interactive?: boolean;
  label?: string;
  name?: string;
}) {
  const t = useT();
  const shape = pinShape(pin.kind);
  const text = label ?? String(pin.idx);
  const wide = text.length > 2;
  const Icon = KIND_ICON[pin.kind] ?? Camera;
  const style = { '--pin-color': KIND_COLOR[pin.kind] ?? KIND_COLOR.sight } as CSSProperties;
  const body = (
    <>
      <span className={styles.shape}>
        {shape === 'drop' ? (
          <svg className={styles.drop} viewBox="0 0 36 44" aria-hidden="true">
            {active ? <path className={styles.outerRing} d={DROP} /> : null}
            <path className={styles.fill} d={DROP} />
          </svg>
        ) : (
          <span className={styles.square} />
        )}
        <span className={styles.num}>
          {/* A drop keeps its 36px head and tail; a wide label sits on it as a pill. */}
          {wide && shape === 'drop' ? <span className={styles.numPill}>{text}</span> : text}
        </span>
        <span className={styles.kind} aria-hidden="true">
          <Icon width={10} height={10} strokeWidth={2.4} />
        </span>
      </span>
      {active && pin.name ? (
        <span className={styles.label} aria-hidden="true">
          {pin.name}
        </span>
      ) : null}
    </>
  );
  const common = {
    className: styles.pin,
    style,
    'data-shape': shape,
    'data-active': active ? '' : undefined,
    'data-wide': wide ? '' : undefined,
    'data-highlight': highlight && !active ? 'true' : undefined,
  };
  return interactive ? (
    <button type="button" aria-label={name ?? pinTitle(pin, t)} {...common}>
      {body}
    </button>
  ) : (
    <div aria-hidden="true" {...common}>
      {body}
    </div>
  );
}

/** Search / POI preview: unnumbered dashed drop with a `+`, pulses once. */
export function PreviewPin({ name }: { name: string }) {
  const t = useT();
  return (
    <div role="img" aria-label={t('map_preview_aria', { name })} className={styles.pin} data-shape="drop" data-preview="">
      <span className={styles.shape}>
        <svg className={styles.drop} viewBox="0 0 36 44" aria-hidden="true">
          <path className={styles.fill} d={DROP} />
        </svg>
        <span className={styles.num}>
          <Plus width={14} height={14} strokeWidth={2.4} />
        </span>
      </span>
    </div>
  );
}
