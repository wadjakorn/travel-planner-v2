'use client';

import { useFormStatus } from 'react-dom';
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

type PendingButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingChild?: React.ReactNode;
  spinnerSize?: number;
  spinnerColor?: string;
  spinnerTrackColor?: string;
};

// Submit button that swaps children for a spinner while the surrounding
// <form> action is pending. Uses useFormStatus so it must live inside a
// <form> element.
export function PendingButton({
  children,
  pendingChild,
  spinnerSize,
  spinnerColor,
  spinnerTrackColor,
  disabled,
  ...rest
}: PendingButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...rest}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending
        ? (pendingChild ?? (
            <Spinner
              size={spinnerSize}
              color={spinnerColor}
              trackColor={spinnerTrackColor}
            />
          ))
        : children}
    </button>
  );
}
