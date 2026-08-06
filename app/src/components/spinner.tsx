'use client';

import styles from './spinner.module.css';

type Props = {
  size?: number;
  color?: string;
  trackColor?: string;
};

export function Spinner({ size = 14, color, trackColor }: Props) {
  return (
    <span
      className={styles.spinner}
      style={{
        width: size,
        height: size,
        borderColor: trackColor ?? 'rgba(0,0,0,0.15)',
        borderTopColor: color ?? '#1d1d1f',
      }}
      aria-hidden
    />
  );
}
