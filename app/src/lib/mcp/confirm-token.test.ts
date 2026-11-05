import { describe, it, expect } from 'vitest';
import { canonicalize, mintConfirmToken, planHash, verifyConfirmToken, CONFIRM_TTL_MS } from './confirm-token';

const S = 'secret-for-tests';
const plan = { trip: { title: 'Kyoto', startDate: '2026-12-01' }, days: [{ places: [{ name: 'Café' }] }] };
const h = planHash(canonicalize(plan));
const base = { u: 'u1', k: 'apply_plan_update' as const, t: 't1', h, at: '2026-11-06T00:00:00.000Z', d: 'x' };
const expect1 = { u: 'u1', k: 'apply_plan_update' as const, t: 't1', h };

describe('confirm token (TP-0035)', () => {
  it('verifies the matching commit and returns the payload', () => {
    const tok = mintConfirmToken(base, S, 1000);
    const v = verifyConfirmToken(tok, expect1, S, 2000);
    expect(v).toMatchObject({ ok: true, payload: { at: base.at, d: 'x', iat: 1000 } });
  });
  it('key order and Unicode normalisation do not change the plan hash', () => {
    const reordered = { days: [{ places: [{ name: 'Café' }] }], trip: { startDate: '2026-12-01', title: 'Kyoto' } };
    expect(planHash(canonicalize(reordered))).toBe(h);
  });
  it('rejects tampering, expiry, another user / trip / plan / tool, and a wrong secret', () => {
    const tok = mintConfirmToken(base, S, 1000);
    const [body, sig] = tok.split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), u: 'u2' })).toString('base64url');
    const reason = (r: ReturnType<typeof verifyConfirmToken>) => (r.ok ? 'ok' : r.reason);
    expect(reason(verifyConfirmToken(`${forged}.${sig}`, expect1, S, 2000))).toBe('bad signature');
    expect(reason(verifyConfirmToken(tok, expect1, 'other', 2000))).toBe('bad signature');
    expect(reason(verifyConfirmToken(tok, expect1, S, 1000 + CONFIRM_TTL_MS + 1))).toBe('token expired');
    expect(reason(verifyConfirmToken(tok, { ...expect1, u: 'u2' }, S, 2000))).toBe('token belongs to another user');
    expect(reason(verifyConfirmToken(tok, { ...expect1, t: 't2' }, S, 2000))).toBe('token is for another trip');
    expect(reason(verifyConfirmToken(tok, { ...expect1, h: 'zz' }, S, 2000))).toBe('the plan changed since the preview');
    expect(reason(verifyConfirmToken(tok, { ...expect1, k: 'create_trip', t: undefined }, S, 2000))).toBe('token is for apply_plan_update');
    expect(reason(verifyConfirmToken('garbage', expect1, S, 2000))).toBe('malformed token');
  });
  it('two previews of the same plan give different tokens (iat)', () => {
    expect(mintConfirmToken(base, S, 1)).not.toBe(mintConfirmToken(base, S, 2));
  });
});
