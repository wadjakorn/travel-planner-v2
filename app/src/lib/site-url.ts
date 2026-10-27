// Single source of truth for the app's canonical base URL.
//
// Resolution is env-only and NEVER reads the request Host / x-forwarded-*
// headers: those are attacker-controllable and produce links that point at
// whatever host answered the request. Prefer an explicit NEXT_PUBLIC_SITE_URL
// (prod: https://travel-planner-v2-eight.vercel.app), then Vercel's injected
// deployment URLs, then the local dev origin.
export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:3000')
  );
}

// Absolute URL for an app-relative path. Leading slash on `path` is optional.
export function absoluteUrl(path: string): string {
  const base = siteUrl().replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}
