'use client';

import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { useFocusTrap } from '@/lib/use-focus-trap';

type Props = {
  ariaLabel: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number | string;
  zIndex?: number;
  panelStyle?: CSSProperties;
};

export function ModalShell({
  ariaLabel,
  onClose,
  children,
  maxWidth = 480,
  zIndex = 100,
  panelStyle,
}: Props) {
  const panelRef = useFocusTrap<HTMLDivElement>();

  // Close on Escape so every ModalShell consumer gets it for free.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          color: 'var(--foreground)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          maxWidth,
          width: '100%',
          boxShadow: 'var(--shadow-lg)',
          padding: 24,
          ...panelStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
