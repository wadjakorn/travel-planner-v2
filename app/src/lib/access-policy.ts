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

// A visitor whose address does not match an invite is, by definition, not
// proven to be the intended recipient — echoing invite.email back at them turns
// any leaked link into an address-disclosure oracle. A mask is enough for the
// real recipient to recognise their own address and useless to anyone else.
// Same stance as /sign-in/not-invited, which echoes no address at all.
export function maskEmail(email: string | null | undefined): string {
  const normalized = normalizeEmail(email);
  if (!normalized) return '';
  const at = normalized.lastIndexOf('@');
  if (at <= 0) return maskPart(normalized);
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const maskedDomain =
    dot > 0
      ? `${maskPart(domain.slice(0, dot))}.${domain.slice(dot + 1)}`
      : maskPart(domain);
  return `${maskPart(local)}@${maskedDomain}`;
}

// Array.from, not slice(0,1): a surrogate pair must not be cut in half.
function maskPart(part: string): string {
  const chars = Array.from(part);
  if (chars.length === 0) return '';
  return `${chars[0]}\u2022\u2022\u2022`;
}
