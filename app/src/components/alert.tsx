// Alert — the app's one notice treatment. Server component; no client JS.
//
// Every alert answers the same question: something on this page is not what
// you would assume, here is what and here is what to do about it. So the API
// is deliberately small — a tone, a message, and at most one action — rather
// than a box that anything can be poured into.
//
// Alerts belong at the top of a page, under the title and above the content:
// a caveat discovered below the number it qualifies is a caveat discovered too
// late. Use <AlertStack> to group them.

import Link from 'next/link';
import styles from './alert.module.css';

type Tone = 'warning' | 'danger' | 'info';

type Props = {
  tone?: Tone;
  children: React.ReactNode;
  // One action, phrased as the thing it does ("Add costs", not "Click here").
  action?: { href: string; label: string };
};

export function Alert({ tone = 'warning', children, action }: Props) {
  return (
    <div className={`${styles.alert} ${styles[tone]}`} role="status">
      <span className={styles.dot} aria-hidden="true" />
      <div className={styles.body}>{children}</div>
      {action && (
        <Link href={action.href} className={styles.action}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function AlertStack({ children }: { children: React.ReactNode }) {
  return <div className={styles.stack}>{children}</div>;
}
