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
