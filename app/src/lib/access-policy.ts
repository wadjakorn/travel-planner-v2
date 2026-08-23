// Pure half of the invite-only access gate: email normalisation and the
// ACCESS_ALLOWLIST env parse. No DB and no `server-only` import so it is
// unit-testable in isolation (see access-policy.test.ts). The queries that
// decide whether an address already has an account live in access-gate.ts.
//
// Same split as rate-limit-policy.ts / rate-limit.ts.

// Lowercase + trim. @auth/core's defaultNormalizer already does this for the
// magic-link address, but Google profile emails arrive unnormalised, so the
// gate must not rely on the provider.
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

// ACCESS_ALLOWLIST="a@x.com, b@y.com" → ['a@x.com','b@y.com'].
// Empty/unset → empty list, which (with INVITE_ONLY on) means "existing users
// and trip invitees only".
export function parseAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => normalizeEmail(entry))
    .filter((entry) => entry.includes('@'));
}

export function isAllowlisted(email: string, allowlist: string[]): boolean {
  const normalized = normalizeEmail(email);
  return normalized !== '' && allowlist.includes(normalized);
}
