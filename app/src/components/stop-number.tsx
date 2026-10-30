import type { CSSProperties } from 'react';
import { KIND_COLOR, type Pin } from '@/lib/map-helpers';
import styles from './stop-number.module.css';

// A stop's number off the map (itinerary row, phone map card): the same kind
// colour and white digit as its map pin, so the two read as one thing.
export function StopNumber({
  kind,
  n,
  className,
  'aria-hidden': ariaHidden,
}: {
  kind: Pin['kind'];
  n: number;
  className?: string;
  'aria-hidden'?: boolean;
}) {
  const style = { '--pin-color': KIND_COLOR[kind] ?? KIND_COLOR.sight } as CSSProperties;
  return (
    <span
      data-stop-number
      className={`${styles.number}${className ? ` ${className}` : ''}`}
      style={style}
      aria-hidden={ariaHidden}
    >
      {n}
    </span>
  );
}
