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
        borderColor: trackColor ?? 'color-mix(in srgb, var(--foreground) 15%, transparent)',
        borderTopColor: color ?? 'var(--foreground)',
      }}
      aria-hidden
    />
  );
}
