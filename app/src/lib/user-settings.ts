// Server-only loader. Pages call loadUserSettings to hydrate the modal.

import 'server-only';
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
