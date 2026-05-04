// Client-safe types + defaults. The server-only lib/user-settings.ts
// imports the DB and must not be reachable from client components.

export type AppSettings = {
  theme: 'light' | 'dark' | 'system';
  lang: 'en' | 'th';
  units: 'metric' | 'imperial';
  notifEmail: boolean;
  notifPush: boolean;
  publicTrip: boolean;
};

export const SETTINGS_DEFAULTS: AppSettings = {
  theme: 'system',
  lang: 'en',
  units: 'metric',
  notifEmail: true,
  notifPush: true,
  publicTrip: false,
};
