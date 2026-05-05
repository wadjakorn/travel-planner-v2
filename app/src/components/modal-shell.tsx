'use client';

import type { CSSProperties, ReactNode } from 'react';

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
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
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
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth,
          width: '100%',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          padding: 24,
          ...panelStyle,
        }}
      >
        {children}
      </div>
    </div>
  );
}
