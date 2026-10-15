import { describe, expect, it, vi } from 'vitest';
import { getPlaceDetail, searchPlaces } from './search';

const geo = { results: [{ place_id: 'g1', name: 'Wat Arun', lat: 13.7437, lon: 100.4888 }] };
const photon = {
  features: [{ geometry: { coordinates: [100.4888, 13.7437] }, properties: { osm_type: 'W', osm_id: 7, name: 'Wat Arun' } }],
};

function router(handlers: { geoapify?: () => Response; photon?: () => Response }) {
  return vi.fn(async (input: URL | RequestInfo) => {
    const u = String(input);
    if (u.includes('geoapify')) return handlers.geoapify?.() ?? new Response('{}');
    if (u.includes('photon')) return handlers.photon?.() ?? new Response('{}');
    throw new Error(`unexpected ${u}`);
  });
}

describe('searchPlaces', () => {
  it('uses Geoapify and fills timezone from coordinates', async () => {
    const fetchImpl = router({ geoapify: () => new Response(JSON.stringify(geo)) });
    const r = await searchPlaces('Wat Arun', { key: 'K', fetchImpl });
    expect(r[0]).toMatchObject({ id: 'geoapify:g1', timeZone: 'Asia/Bangkok' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('mixed Thai/Latin query asks Geoapify in Thai', async () => {
    const fetchImpl = router({ geoapify: () => new Response(JSON.stringify(geo)) });
    await searchPlaces('ร้าน Ristr8to', { key: 'K', fetchImpl });
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('lang')).toBe('th');
  });
  it('falls back to Photon on 429', async () => {
    const fetchImpl = router({
      geoapify: () => new Response('quota', { status: 429 }),
      photon: () => new Response(JSON.stringify(photon)),
    });
    const r = await searchPlaces('Wat Arun', { key: 'K', fetchImpl });
    expect(r[0].id).toBe('osm:W7');
  });
  it('falls back to Photon when Geoapify finds nothing', async () => {
    const fetchImpl = router({
      geoapify: () => new Response(JSON.stringify({ results: [] })),
      photon: () => new Response(JSON.stringify(photon)),
    });
    expect((await searchPlaces('Wat Arun', { key: 'K', fetchImpl }))[0].id).toBe('osm:W7');
  });
  it('skips Geoapify without a key', async () => {
    const fetchImpl = router({ photon: () => new Response(JSON.stringify(photon)) });
    await searchPlaces('Wat Arun', { key: '', fetchImpl });
    expect(fetchImpl.mock.calls.every((c) => String(c[0]).includes('photon'))).toBe(true);
  });
  it('returns [] when both fail', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('down'); });
    expect(await searchPlaces('x', { key: 'K', fetchImpl })).toEqual([]);
  });
});

describe('getPlaceDetail', () => {
  it('null for non-Geoapify ids without calling out', async () => {
    const fetchImpl = vi.fn();
    expect(await getPlaceDetail('osm:N1', 'en', { key: 'K', fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('strips the prefix and returns null on upstream failure', async () => {
    const fetchImpl = vi.fn(async (_u: URL | RequestInfo) => new Response('', { status: 500 }));
    expect(await getPlaceDetail('geoapify:abc', 'th', { key: 'K', fetchImpl })).toBeNull();
    expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('id')).toBe('abc');
  });
});
