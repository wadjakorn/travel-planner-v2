'use client';

import { KIND_COLOR } from '@/lib/map-helpers';

export function PinBadge({
  idx,
  kind,
  active,
}: {
  idx: number;
  kind: string;
  active?: boolean;
}) {
  const bg = active ? '#0f766e' : KIND_COLOR[kind] ?? KIND_COLOR.sight;
  return (
    <div
      style={{
        width: active ? 32 : 28,
        height: active ? 32 : 28,
        borderRadius: '50%',
        background: bg,
        color: '#fff',
        fontSize: active ? 13 : 12,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: active
          ? '0 4px 12px rgba(15,118,110,0.5)'
          : '0 2px 6px rgba(0,0,0,0.3)',
        border: '2px solid rgba(255,255,255,0.95)',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        letterSpacing: '-0.02em',
        userSelect: 'none',
        transition: 'transform 120ms ease',
        cursor: 'pointer',
      }}
    >
      {idx}
    </div>
  );
}
