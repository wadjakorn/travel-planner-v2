'use client';

import { useEffect, useState } from 'react';
import { Layers, Close } from '@/components/icons';

export function MapPanelToggle() {
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (full) document.body.dataset.fullmap = '1';
    else delete document.body.dataset.fullmap;
    return () => {
      delete document.body.dataset.fullmap;
    };
  }, [full]);

  return (
    <button
      type="button"
      onClick={() => setFull((v) => !v)}
      aria-label={full ? 'Hide map' : 'Show map'}
      title={full ? 'Hide map' : 'Show map'}
      className="fixed left-3 top-3 z-[60] inline-flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg ring-1 ring-zinc-200 text-zinc-700 hover:text-zinc-900 md:hidden"
    >
      {full ? <Layers width={18} height={18} /> : <Close width={18} height={18} />}
    </button>
  );
}
