'use server';

import { revalidatePath } from 'next/cache';
import { actionOk, type ActionResult } from '@/lib/action-result';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { userSettings } from '@/db/schema';
import { tFor } from '@/lib/i18n';
import { LANG_COOKIE, LANG_COOKIE_OPTIONS } from '@/lib/lang-resolve';

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

export async function saveSettingsAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
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
  jar.set(LANG_COOKIE, lang, LANG_COOKIE_OPTIONS);
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

  // Form-only action, so the toast is UI copy (i18n Decision 1 covers REST/
  // service errors only). ActionForm shows this message over its own
  // successMessage, so a literal here would win in every language. tFor(lang),
  // not tServer(): this request still carries the old cookie, and the toast
  // should already speak the language just saved.
  return actionOk(tFor(lang)('settings_saved_toast'));
}

// The landing's EN/ไทย switch (TP-0074). Writes the same `lang` cookie the
// settings form does, so a visitor's pick carries over once they sign in.
// No auth needed: it only records a display preference for this browser.
export async function setLandingLangAction(formData: FormData): Promise<void> {
  const lang = pick(formData.get('lang'), LANGS, 'en') as Lang;
  (await cookies()).set(LANG_COOKIE, lang, LANG_COOKIE_OPTIONS);
  // 'layout': the root layout renders <html lang> and the client dictionary.
  revalidatePath('/', 'layout');
}
