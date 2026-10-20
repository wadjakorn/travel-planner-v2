import { readFileSync, existsSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { geoapifyAutocomplete, parseGeoapifyAutocomplete, parseGeoapifyDetails } from './geoapify';

const auto = {
  results: [
    {
      place_id: '51abc', name: 'ตลาดน้ำอัมพวา', address_line1: 'ตลาดน้ำอัมพวา',
      address_line2: 'อัมพวา, สมุทรสงคราม, ประเทศไทย', formatted: 'ตลาดน้ำอัมพวา, อัมพวา, สมุทรสงคราม',
      lat: 13.4253, lon: 99.9553, category: 'commercial.marketplace', timezone: { name: 'Asia/Bangkok' },
    },
    { place_id: '51def', formatted: 'Amphawa, Samut Songkhram', address_line1: 'Amphawa', lat: 13.42, lon: 99.95 },
    { place_id: 'bad', name: 'no coords' },
  ],
};

describe('parseGeoapifyAutocomplete', () => {
  it('maps results, prefixes ids, drops rows without coordinates', () => {
    const r = parseGeoapifyAutocomplete(auto);
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({
      id: 'geoapify:51abc', name: 'ตลาดน้ำอัมพวา', secondary: 'อัมพวา, สมุทรสงคราม, ประเทศไทย',
      address: 'ตลาดน้ำอัมพวา, อัมพวา, สมุทรสงคราม', lat: 13.4253, lng: 99.9553, kind: 'sight',
      timeZone: 'Asia/Bangkok',
    });
    expect(r[1].name).toBe('Amphawa');
    expect(r[1].timeZone).toBeNull();
  });
  it('falls back to address_line1 when name is an empty string', () => {
    const r = parseGeoapifyAutocomplete({
      results: [{ place_id: 'e1', name: '', address_line1: 'Soi 5', formatted: 'Soi 5, Bangkok', lat: 1, lon: 2 }],
    });
    expect(r[0].name).toBe('Soi 5');
  });
  it('tolerates garbage', () => {
    expect(parseGeoapifyAutocomplete(null)).toEqual([]);
    expect(parseGeoapifyAutocomplete({ results: 'x' })).toEqual([]);
  });
});

describe('parseGeoapifyDetails', () => {
  it('reads the details feature', () => {
    const d = parseGeoapifyDetails({
      features: [
        { properties: { feature_type: 'building', place_id: 'zzz', lat: 1, lon: 1 } },
        {
          properties: {
            feature_type: 'details', place_id: '51abc', name: 'Ristr8to', formatted: 'Nimman, Chiang Mai',
            address_line2: 'Chiang Mai', lat: 18.8, lon: 98.97, categories: ['catering.cafe'],
            website: 'https://ristr8to.com', contact: { phone: '+66 53 215 278' },
            opening_hours: 'Mo-Su 07:00-18:00', timezone: { name: 'Asia/Bangkok' },
          },
        },
      ],
    });
    expect(d).toMatchObject({
      id: 'geoapify:51abc', name: 'Ristr8to', kind: 'food', phone: '+66 53 215 278',
      website: 'https://ristr8to.com', hours: 'Mo-Su 07:00-18:00', lat: 18.8, lng: 98.97,
    });
  });
  it('null when nothing usable', () => {
    expect(parseGeoapifyDetails({ features: [] })).toBeNull();
  });
});

describe('geoapifyAutocomplete', () => {
  it('sends lang, bias and key; throws on non-2xx', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(auto)));
    await geoapifyAutocomplete('อัมพวา', { key: 'K', lang: 'th', fetchImpl });
    const url = new URL(String(fetchImpl.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe('https://api.geoapify.com/v1/geocode/autocomplete');
    expect(url.searchParams.get('lang')).toBe('th');
    expect(url.searchParams.get('bias')).toBe('countrycode:th');
    expect(url.searchParams.get('format')).toBe('json');
    expect(url.searchParams.get('apiKey')).toBe('K');

    const failing = vi.fn<typeof fetch>(async () => new Response('quota', { status: 429 }));
    await expect(geoapifyAutocomplete('x', { key: 'K', lang: 'en', fetchImpl: failing })).rejects.toThrow('429');
  });
});

// Real captured responses. Structural only — content drifts.
const fx = (f: string) => new URL(`./__fixtures__/${f}`, import.meta.url);
const load = (f: string) => JSON.parse(readFileSync(fx(f), 'utf8'));
describe.runIf(existsSync(fx('geoapify-autocomplete.json')))('live fixtures', () => {
  it('autocomplete fixture parses to usable rows', () => {
    const r = parseGeoapifyAutocomplete(load('geoapify-autocomplete.json'));
    expect(r.length).toBeGreaterThan(0);
    for (const s of r) expect(Number.isFinite(s.lat) && s.id.startsWith('geoapify:')).toBe(true);
  });
  it('details fixture parses', () => {
    expect(parseGeoapifyDetails(load('geoapify-details.json'))).not.toBeNull();
  });
  it.runIf(existsSync(fx('geoapify-details-cafe.json')))('cafe details fixture parses (top-level website, kind food)', () => {
    const d = parseGeoapifyDetails(load('geoapify-details-cafe.json'));
    expect(d).not.toBeNull();
    expect(d!.kind).toBe('food');
    expect(d!.website).toMatch(/^https?:\/\//);
  });
});

describe('geoapifyAutocomplete abort', () => {
  it('rejects when the caller signal is already aborted', async () => {
    const fetchImpl = vi.fn((_u: unknown, init?: RequestInit) =>
      new Promise<Response>((_res, rej) => {
        if (init?.signal?.aborted) rej(new Error('aborted'));
      }));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(
      geoapifyAutocomplete('x', { key: 'K', lang: 'en', fetchImpl: fetchImpl as unknown as typeof fetch, signal: ctrl.signal }),
    ).rejects.toThrow();
  });
});
