import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceError } from '@/lib/services/service-error';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {}, dbNode: {} }));
const requireApiUser = vi.fn();
const consumeRateLimit = vi.fn();
vi.mock('@/lib/api-auth', () => ({ requireApiUser: (...a: unknown[]) => requireApiUser(...a) }));
vi.mock('@/lib/api/rate-limit', () => ({ consumeRateLimit: (...a: unknown[]) => consumeRateLimit(...a), consumeRateLimitKey: vi.fn() }));

import * as route from './route';

const rpc = (body: unknown) =>
  new Request('http://localhost/api/mcp', {
    method: 'POST',
    headers: { authorization: 'Bearer t', 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireApiUser.mockResolvedValue({ tokenId: 'tok', userId: 'u1', scope: 'read' });
  consumeRateLimit.mockResolvedValue({ ok: true });
});

describe('/api/mcp route (TP-0035)', () => {
  it('only POST is exported (GET/DELETE → 405 by Next)', () => {
    expect(Object.keys(route).filter((k) => /^[A-Z]+$/.test(k))).toEqual(['POST']);
    expect(route.runtime).toBe('nodejs');
  });
  it('401 with WWW-Authenticate when the token is missing', async () => {
    requireApiUser.mockRejectedValueOnce(new ServiceError('unauthorized', 'Missing bearer token'));
    const res = await route.POST(rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toMatch(/^Bearer/);
  });
  it('rejects a JSON-RPC batch (one HTTP request = one call)', async () => {
    const res = await route.POST(rpc([{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/list' }]));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(-32600);
  });
  it('initialize over HTTP works with a read token', async () => {
    const res = await route.POST(
      rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } }),
    );
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.result.serverInfo.name).toBe('travel-planner');
    expect(consumeRateLimit).toHaveBeenCalledWith('tok');
  });
});
