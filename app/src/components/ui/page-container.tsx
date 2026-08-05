// The one content-width wrapper for trip pages. Every page that has a text
// column uses this so switching tabs does not shift the content edges.
// Server-safe on purpose: it must be usable from server components.

import styles from './page-container.module.css';

type Props = {
  children: React.ReactNode;
  className?: string;
};

export function PageContainer({ children, className }: Props) {
  return (
    <div className={className ? `${styles.container} ${className}` : styles.container}>
      {children}
    </div>
  );
}
