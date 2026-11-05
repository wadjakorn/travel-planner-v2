import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { parsePhoton, photonSearch } from './photon';

const sample = {
  features: [
    {
      geometry: { coordinates: [98.9676, 18.7999] },
      properties: {
        osm_type: 'N', osm_id: 123, osm_key: 'amenity', osm_value: 'cafe', name: 'Ristr8to',
        street: 'Nimmanahaeminda Road', city: 'Chiang Mai', country: 'Thailand',
      },
    },
    { geometry: { coordinates: [1, 1] }, properties: { osm_type: 'W', osm_id: 9 } },
  ],
};

describe('parsePhoton', () => {
  it('maps named features with osm ids', () => {
    const r = parsePhoton(sample);
    expect(r).toEqual([
      {
        id: 'osm:N123', name: 'Ristr8to', secondary: 'Nimmanahaeminda Road, Chiang Mai, Thailand',
        address: 'Ristr8to, Nimmanahaeminda Road, Chiang Mai, Thailand', lat: 18.7999, lng: 98.9676,
        kind: 'food', timeZone: null,
      },
    ]);
  });
  it('tolerates garbage', () => {
    expect(parsePhoton(undefined)).toEqual([]);
  });
});

describe('photonSearch', () => {
  it('biases towards Thailand', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ features: [] })));
    await photonSearch('wat', { fetchImpl });
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('lat')).toBe('13.75');
    expect(url.searchParams.get('lon')).toBe('100.5');
  });
  it('uses a supplied proximity bias', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ features: [] })));
    await photonSearch('wat', {
      fetchImpl,
      bias: { kind: 'point', lat: 35.69, lng: 139.7, radius: 10_000 },
    });
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('lat')).toBe('35.69');
    expect(url.searchParams.get('lon')).toBe('139.7');
  });
  it('uses the center of a supplied viewport rectangle bias', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ features: [] })));
    await photonSearch('wat', {
      fetchImpl,
      bias: { kind: 'rect', south: 35.6, west: 139.6, north: 35.8, east: 139.8 },
    });
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get('lat')).toBe('35.7');
    expect(url.searchParams.get('lon')).toBe('139.7');
  });
  it('throws on non-2xx', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    await expect(photonSearch('x', { fetchImpl })).rejects.toThrow('503');
  });
});

const fx = new URL('./__fixtures__/photon.json', import.meta.url);
describe.runIf(existsSync(fx))('live fixture', () => {
  it('parses', () => {
    expect(parsePhoton(JSON.parse(readFileSync(fx, 'utf8'))).length).toBeGreaterThan(0);
  });
});

describe('photonSearch abort', () => {
  it('rejects when the caller signal is already aborted', async () => {
    const fetchImpl = vi.fn((_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        if (init?.signal?.aborted) rej(new Error('aborted'));
      }));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(photonSearch('x', { fetchImpl: fetchImpl as unknown as typeof fetch, signal: ctrl.signal })).rejects.toThrow();
  });
});

describe('photonSearch gate + retry (TP-0151)', () => {
  const ok = () => new Response(JSON.stringify(sample));
  it('runs one request at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ok();
    });
    await Promise.all(['a', 'b', 'c', 'd'].map((q) => photonSearch(q, { fetchImpl })));
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(peak).toBe(1);
  });
  it('retries once on 503, then succeeds', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(ok());
    const r = await photonSearch('wat', { fetchImpl, retryDelayMs: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(r.length).toBeGreaterThan(0);
  });
  it('throws after a second 503; does not retry other statuses', async () => {
    const twice = vi.fn(async () => new Response('', { status: 503 }));
    await expect(photonSearch('wat', { fetchImpl: twice, retryDelayMs: 1 })).rejects.toThrow('photon 503');
    expect(twice).toHaveBeenCalledTimes(2);
    const bad = vi.fn(async () => new Response('', { status: 500 }));
    await expect(photonSearch('wat', { fetchImpl: bad, retryDelayMs: 1 })).rejects.toThrow('photon 500');
    expect(bad).toHaveBeenCalledTimes(1);
  });
  it('an aborted waiter rejects without blocking the queue', async () => {
    let release!: () => void;
    const slow = vi.fn(() => new Promise<Response>((r) => (release = () => r(ok()))));
    const first = photonSearch('a', { fetchImpl: slow });
    const ac = new AbortController();
    const waiter = photonSearch('b', { fetchImpl: slow, signal: ac.signal });
    ac.abort();
    await expect(waiter).rejects.toBeDefined();
    await new Promise((r) => setTimeout(r, 0));
    release();
    await first;
    const next = await photonSearch('c', { fetchImpl: vi.fn(async () => ok()) });
    expect(next.length).toBeGreaterThan(0);
    expect(slow).toHaveBeenCalledTimes(1); // the aborted waiter never fetched
  });
});
