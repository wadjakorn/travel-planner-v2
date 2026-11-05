// Preview → commit binding for the MCP bulk-write tools (TP-0035 design §3.1,
// v2 M3/M4/N1). A token proves a preview of exactly this plan happened for this
// user (and trip version); it does not prove the user saw it (M8).

import { createHash, createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';

export type ConfirmKind = 'create_trip' | 'apply_plan_update';
export type ConfirmPayload = {
  v: 1;
  u: string; // userId
  k: ConfirmKind;
  t?: string; // tripId (plan updates)
  h: string; // sha256(canonicalJSON(plan))
  at?: string; // trip.updatedAt the preview ran on (plan updates)
  d: string; // digest of the preview outcome (M5)
  iat: number;
  exp: number;
};

export const CONFIRM_TTL_MS = 30 * 60 * 1000;

/** Keys sorted recursively, strings NFC-normalised: the same plan re-serialised hashes the same. */
export function canonicalize(v: unknown): unknown {
  if (typeof v === 'string') return v.normalize('NFC');
  if (Array.isArray(v)) return v.map(canonicalize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = canonicalize(x);
    }
    return out;
  }
  return v;
}

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const planHash = (canonicalPlan: unknown) => sha256(JSON.stringify(canonicalPlan));

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function key(secret: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), 'tp-mcp-confirm-v1', 32));
}

export function mintConfirmToken(
  p: Omit<ConfirmPayload, 'v' | 'iat' | 'exp'>,
  secret: string,
  now = Date.now(),
): string {
  const payload: ConfirmPayload = { v: 1, ...p, iat: now, exp: now + CONFIRM_TTL_MS };
  const body = b64(JSON.stringify(payload));
  const sig = createHmac('sha256', key(secret)).update(body).digest();
  return `${body}.${b64(sig)}`;
}

export type VerifyExpect = { u: string; k: ConfirmKind; t?: string; h: string };

/** The payload, or a reason the token does not match this commit. */
export function verifyConfirmToken(
  token: string,
  expect: VerifyExpect,
  secret: string,
  now = Date.now(),
): { ok: true; payload: ConfirmPayload } | { ok: false; reason: string } {
  const [body, sig] = token.split('.');
  if (!body || !sig) return { ok: false, reason: 'malformed token' };
  const want = createHmac('sha256', key(secret)).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: 'bad signature' };
  let p: ConfirmPayload;
  try {
    p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed token' };
  }
  if (p.v !== 1) return { ok: false, reason: 'unknown token version' };
  if (now > p.exp) return { ok: false, reason: 'token expired' };
  if (p.u !== expect.u) return { ok: false, reason: 'token belongs to another user' };
  if (p.k !== expect.k) return { ok: false, reason: `token is for ${p.k}` };
  if ((p.t ?? null) !== (expect.t ?? null)) return { ok: false, reason: 'token is for another trip' };
  if (p.h !== expect.h) return { ok: false, reason: 'the plan changed since the preview' };
  return { ok: true, payload: p };
}

/** Preview outcome digest: diff counts + sorted warning codes (M5). */
export function previewDigest(counts: Record<string, number>, warningCodes: string[]): string {
  return sha256(JSON.stringify([canonicalize(counts), [...warningCodes].sort()])).slice(0, 16);
}
