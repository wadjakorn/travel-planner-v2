'use client';

// "Saved Xm ago" indicator. Fed by trip.updatedAt — updates the
// relative-time string every 30s without a re-fetch.

import { useEffect, useState } from 'react';
import { useT } from '@/components/i18n-provider';
import type { Translate } from '@/lib/i18n-client';

export function formatAgo(ms: number, t: Translate): string {
  if (ms < 0) return t('saved_just_now');
  const sec = Math.floor(ms / 1000);
  if (sec < 10) return t('saved_just_now');
  if (sec < 60) return t('saved_sec_ago', { n: sec });
  const min = Math.floor(sec / 60);
  if (min < 60) return t('saved_min_ago', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('saved_hour_ago', { n: hr });
  const d = Math.floor(hr / 24);
  return t('saved_day_ago', { n: d });
}

type Props = {
  updatedAtIso: string;
};

export function SavedAgo({ updatedAtIso }: Props) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const updatedAt = new Date(updatedAtIso).getTime();
  const ago = formatAgo(now - updatedAt, t);

  return (
    <span suppressHydrationWarning className="text-xs text-muted">
      · {t('saved_ago', { ago })}
    </span>
  );
}
