'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { userSettings } from '@/db/schema';

const THEMES = ['light', 'dark', 'system'] as const;
const LANGS = ['en', 'th'] as const;
const UNITS = ['metric', 'imperial'] as const;

type Theme = (typeof THEMES)[number];
type Lang = (typeof LANGS)[number];
type Units = (typeof UNITS)[number];

function pick<T extends readonly string[]>(
  v: FormDataEntryValue | null,
  list: T,
  fallback: T[number],
): T[number] {
  if (typeof v !== 'string') return fallback;
  return (list as readonly string[]).includes(v) ? (v as T[number]) : fallback;
}

function bool(v: FormDataEntryValue | null): boolean {
  return v === 'on' || v === 'true' || v === '1';
}

export async function saveSettingsAction(formData: FormData) {
  const session = await auth();
  const theme = pick(formData.get('theme'), THEMES, 'system') as Theme;
  const lang = pick(formData.get('lang'), LANGS, 'en') as Lang;
  const units = pick(formData.get('units'), UNITS, 'metric') as Units;
  const notifEmail = bool(formData.get('notifEmail'));
  const notifPush = bool(formData.get('notifPush'));
  const publicTrip = bool(formData.get('publicTrip'));

  // Cookie for SSR theme/lang on every request — works for anonymous too.
  const jar = await cookies();
  jar.set('theme', theme, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  jar.set('lang', lang, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  jar.set('units', units, { path: '/', maxAge: 60 * 60 * 24 * 365 });

  if (session?.user?.id) {
    const userId = session.user.id;
    const existing = await db
      .select({ userId: userSettings.userId })
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const values = {
      userId,
      theme,
      lang,
      units,
      notifEmail,
      notifPush,
      publicTrip,
      updatedAt: new Date(),
    };
    if (existing[0]) {
      await db
        .update(userSettings)
        .set(values)
        .where(eq(userSettings.userId, userId));
    } else {
      await db.insert(userSettings).values(values);
    }
  }

  // Bust layout cache so SSR re-reads cookies on every route.
  revalidatePath('/', 'layout');
}
