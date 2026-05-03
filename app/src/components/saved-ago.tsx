'use client';

// "Saved Xm ago" indicator. Fed by trip.updatedAt — updates the
// relative-time string every 30s without a re-fetch.

import { useEffect, useState } from 'react';

function formatAgo(ms: number): string {
  if (ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

type Props = {
  updatedAtIso: string;
  prefix?: string;
};

export function SavedAgo({ updatedAtIso, prefix = 'Saved' }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const updatedAt = new Date(updatedAtIso).getTime();
  const ago = formatAgo(now - updatedAt);

  return (
    <span suppressHydrationWarning className="text-xs text-zinc-500">
      · {prefix} {ago}
    </span>
  );
}
