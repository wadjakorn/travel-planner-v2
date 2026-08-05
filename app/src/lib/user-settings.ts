// Server-only loader. Pages call loadUserSettings to hydrate the modal.

import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { userSettings } from '@/db/schema';
import { SETTINGS_DEFAULTS, type AppSettings } from './user-settings-types';

export { SETTINGS_DEFAULTS };
export type { AppSettings };

export async function loadUserSettings(
  userId: string,
): Promise<AppSettings> {
  const row = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const r = row[0];
  if (!r) return { ...SETTINGS_DEFAULTS };
  return {
    theme: r.theme,
    lang: r.lang,
    units: r.units,
    notifEmail: r.notifEmail,
    notifPush: r.notifPush,
    publicTrip: r.publicTrip,
  };
}

function cookieSetting(
  value: string | undefined,
  allowed: readonly string[],
  fallback: string,
): string {
  return value && allowed.includes(value) ? value : fallback;
}

export async function loadAccountSettings(
  userId?: string | null,
): Promise<AppSettings> {
  if (userId) return loadUserSettings(userId);

  const jar = await cookies();
  return {
    ...SETTINGS_DEFAULTS,
    theme: cookieSetting(jar.get('theme')?.value, ['light', 'dark', 'system'], SETTINGS_DEFAULTS.theme) as AppSettings['theme'],
    lang: cookieSetting(jar.get('lang')?.value, ['en', 'th'], SETTINGS_DEFAULTS.lang) as AppSettings['lang'],
    units: cookieSetting(jar.get('units')?.value, ['metric', 'imperial'], SETTINGS_DEFAULTS.units) as AppSettings['units'],
  };
}

// The single source of truth for "which units do I render distances in".
//
// The account row wins over the cookie: the cookie is only written by the
// settings action on the device that saved, so reading it alone shows a
// signed-in user metric on every other browser they use. cache() keeps the
// trip layout and the itinerary page — which both need this — to one query.
export const resolveUnits = cache(
  async (userId?: string | null): Promise<AppSettings['units']> =>
    (await loadAccountSettings(userId)).units,
);
