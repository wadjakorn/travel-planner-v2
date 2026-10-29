import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => ({ user: { id: 'u1' } })) }));
vi.mock('@/lib/places/rate-limit', () => ({ allowPlacesRequest: vi.fn(async () => true) }));
vi.mock('@/lib/places/search', () => ({
  searchPlaces: vi.fn(async () => []),
  suggestFromLink: vi.fn(async () => ({ results: [], linkError: null })),
}));

import { allowPlacesRequest } from '@/lib/places/rate-limit';
import { searchPlaces, suggestFromLink } from '@/lib/places/search';
import { GET } from './route';

const get = (q: string) =>
  GET(new NextRequest(`http://localhost/api/places/autocomplete?q=${encodeURIComponent(q)}`));

const SHARE = ['Jay Fai', '327 Maha Chai Rd', 'https://maps.app.goo.gl/AbC?g_st=ic'];

beforeEach(() => vi.clearAllMocks());

describe('GET /api/places/autocomplete', () => {
  it.each([
    ['newline-joined', SHARE.join('\n')],
    ['space-joined', SHARE.join(' ')],
  ])('routes %s share text to suggestFromLink', async (_n, q) => {
    await get(q);
    expect(suggestFromLink).toHaveBeenCalledWith('https://maps.app.goo.gl/AbC?g_st=ic', { session: null });
    expect(searchPlaces).not.toHaveBeenCalled();
  });
  it('plain text goes to searchPlaces with linkError null', async () => {
    const res = await get('Jay Fai');
    expect(searchPlaces).toHaveBeenCalledWith('Jay Fai', { session: null });
    expect(suggestFromLink).not.toHaveBeenCalled();
    expect(await res.json()).toEqual({ results: [], linkError: null });
  });
  it('forwards a valid near bias through both paths', async () => {
    await GET(new NextRequest('http://localhost/api/places/autocomplete?q=Lawson&near=35.69,139.70'));
    expect(searchPlaces).toHaveBeenCalledWith('Lawson', { session: null, bias: { kind: 'point', lat: 35.69, lng: 139.7, radius: 10_000 } });
    await GET(new NextRequest(`http://localhost/api/places/autocomplete?q=${encodeURIComponent(SHARE[2])}&near=35.69,139.70`));
    expect(suggestFromLink).toHaveBeenCalledWith(SHARE[2], { session: null, bias: { kind: 'point', lat: 35.69, lng: 139.7, radius: 10_000 } });
  });
  it('forwards a valid bbox ahead of near', async () => {
    await GET(new NextRequest('http://localhost/api/places/autocomplete?q=xx&bbox=1,2,3,4&near=5,6'));
    expect(searchPlaces).toHaveBeenCalledWith('xx', {
      session: null,
      bias: { kind: 'rect', south: 1, west: 2, north: 3, east: 4 },
    });
  });
  it('falls back to near when bbox crosses the antimeridian', async () => {
    await GET(new NextRequest('http://localhost/api/places/autocomplete?q=xx&bbox=1,170,3,-170&near=5,6'));
    expect(searchPlaces).toHaveBeenCalledWith('xx', {
      session: null,
      bias: { kind: 'point', lat: 5, lng: 6, radius: 10_000 },
    });
  });
  it('ignores malformed near without rejecting the query', async () => {
    const res = await GET(new NextRequest('http://localhost/api/places/autocomplete?q=Lawson&near=garbage'));
    expect(res.status).toBe(200);
    expect(searchPlaces).toHaveBeenCalledWith('Lawson', { session: null });
  });
  it('passes the session token through to both paths', async () => {
    const S = '3b241101-e2bb-4255-8caf-4136c566a962';
    await GET(new NextRequest(`http://localhost/api/places/autocomplete?q=Jay+Fai&session=${S}`));
    expect(searchPlaces).toHaveBeenCalledWith('Jay Fai', { session: S });
    await GET(new NextRequest(`http://localhost/api/places/autocomplete?q=${encodeURIComponent(SHARE[2])}&session=${S}`));
    expect(suggestFromLink).toHaveBeenCalledWith(SHARE[2], { session: S });
  });
  it('forwards a valid origin to searchPlaces only; drops an invalid one', async () => {
    await GET(new NextRequest('http://localhost/api/places/autocomplete?q=ramen&origin=35.658,139.702'));
    expect(searchPlaces).toHaveBeenCalledWith('ramen', { session: null, origin: { lat: 35.658, lng: 139.702 } });
    await GET(new NextRequest(`http://localhost/api/places/autocomplete?q=${encodeURIComponent(SHARE[2])}&origin=35.658,139.702`));
    expect(suggestFromLink).toHaveBeenCalledWith(SHARE[2], { session: null });
    for (const bad of ['NaN,1', '91,0', '1,2,3']) {
      await GET(new NextRequest(`http://localhost/api/places/autocomplete?q=ramen&origin=${bad}`));
      expect(searchPlaces).toHaveBeenLastCalledWith('ramen', { session: null });
    }
  });
  it('short queries and rate limited requests carry linkError null', async () => {
    expect(await (await get('a')).json()).toEqual({ results: [], linkError: null });
    vi.mocked(allowPlacesRequest).mockResolvedValueOnce(false);
    expect(await (await get('Jay Fai')).json()).toEqual({ results: [], linkError: null });
  });
});
