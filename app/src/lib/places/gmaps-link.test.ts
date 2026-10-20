import { describe, expect, it, vi } from 'vitest';
import { expandShortLink, extractGmapsUrl, isGmapsUrl, parseGmapsUrl, readGmapsLink } from './gmaps-link';
import { LIVE_PIN, LIVE_PLACE, PLACE } from './__fixtures__/gmaps-links';

describe('parseGmapsUrl', () => {
  it('reads the exact pin, name and CID from a place URL', () => {
    expect(parseGmapsUrl(PLACE)).toEqual({
      name: 'Jay Fai',
      query: null,
      lat: 13.75249,
      lng: 100.50449,
      precision: 'exact',
      cid: '8015311305313251184',
      googlePlaceId: null,
    });
  });
  it('parses the live place fixture', () => {
    expect(parseGmapsUrl(LIVE_PLACE)).toMatchObject({
      name: 'Steak no Don',
      lat: 34.5945482,
      lng: 133.7583428,
      precision: 'exact',
      cid: '2061482896174680255',
    });
  });
  it('parses a dropped pin with a ",+" separator as exact', () => {
    expect(parseGmapsUrl(LIVE_PIN)).toMatchObject({
      lat: 39.920439,
      lng: 116.331538,
      precision: 'exact',
      query: null,
    });
  });
  it('treats @lat,lng without !3d/!4d as viewport', () => {
    expect(parseGmapsUrl('https://www.google.com/maps/place/Jay+Fai/@13.7522,100.5042,17z')).toMatchObject({
      lat: 13.7522,
      precision: 'viewport',
      cid: null,
    });
  });
  it('reads ftid as CID', () => {
    expect(
      parseGmapsUrl('https://maps.google.com/maps?q=Jay+Fai,+Bangkok&ftid=0x30e2993d6a1e2a8d:0x6f3c1b2a4d5e6f70'),
    ).toMatchObject({ query: 'Jay Fai, Bangkok', cid: '8015311305313251184', lat: null });
  });
  it('decodes Thai and %2B names, survives malformed %', () => {
    expect(
      parseGmapsUrl('https://www.google.com/maps/place/%E0%B9%80%E0%B8%88%E0%B9%8A%E0%B9%84%E0%B8%9D/@1,2,3z')!.name,
    ).toBe('เจ๊ไฝ');
    expect(parseGmapsUrl('https://www.google.com/maps/place/A%2BB+Cafe/@1,2,3z')!.name).toBe('A+B Cafe');
    expect(parseGmapsUrl('https://www.google.com/maps/place/%E0%B9/@1,2,3z')!.name).toBeNull();
  });
  it('reads api=1 search URLs and cid', () => {
    expect(
      parseGmapsUrl('https://www.google.com/maps/search/?api=1&query=Jay%20Fai%2C%20Bangkok&query_place_id=ChIJabc'),
    ).toMatchObject({ query: 'Jay Fai, Bangkok', lat: null, googlePlaceId: 'ChIJabc' });
    expect(parseGmapsUrl('https://maps.google.com/?cid=8015311305313251184')).toMatchObject({
      cid: '8015311305313251184',
    });
  });
  it('rejects non-Google, lookalike, http, ported and out-of-range input', () => {
    for (const u of [
      'https://google.com.evil.io/maps/place/X',
      'https://maps.app.goo.gl.evil.io/abc',
      'http://www.google.com/maps/place/X/@1,2,3z',
      'https://www.google.com:8443/maps/place/X',
      'http://169.254.169.254/',
      'Jay Fai',
    ])
      expect(parseGmapsUrl(u)).toBeNull();
    expect(isGmapsUrl('https://maps.app.goo.gl/AbC123')).toBe(true);
    expect(isGmapsUrl('https://goo.gl/photos/x')).toBe(false);
    expect(parseGmapsUrl('https://maps.google.com/?q=95,100')!.lat).toBeNull();
  });
  it('parses directions and embed URLs to an all-null link', () => {
    const empty = { name: null, query: null, lat: null, lng: null, precision: null, cid: null, googlePlaceId: null };
    expect(parseGmapsUrl('https://www.google.com/maps/dir/A/B/@1,2,3z')).toEqual(empty);
    expect(parseGmapsUrl('https://www.google.com/maps/embed?pb=!1m1!3d1!4d2')).toEqual(empty);
  });
});

describe('non-maps Google paths and cid validation', () => {
  it('rejects google.com paths outside /maps', () => {
    for (const u of ['https://www.google.com/search?q=cats', 'https://www.google.com/url?q=https://evil.io', 'https://goo.gl/mapsfoo']) {
      expect(parseGmapsUrl(u)).toBeNull();
      expect(isGmapsUrl(u)).toBe(false);
    }
    expect(isGmapsUrl('https://www.google.com/maps?q=x')).toBe(true);
    expect(isGmapsUrl('https://maps.google.com/')).toBe(true);
    expect(isGmapsUrl('https://goo.gl/maps/abc')).toBe(true);
  });
  it('skips non-maps Google links in share text', () => {
    expect(extractGmapsUrl('https://www.google.com/search?q=cats then https://maps.app.goo.gl/AbC')).toBe(
      'https://maps.app.goo.gl/AbC',
    );
  });
  it('strips trailing punctuation from the link', () => {
    expect(extractGmapsUrl('see https://maps.app.goo.gl/AbC).')).toBe('https://maps.app.goo.gl/AbC');
  });
  it('drops a non-numeric cid', () => {
    expect(parseGmapsUrl('https://maps.google.com/?cid=1%26q%3Dx')!.cid).toBeNull();
  });
});

describe('extractGmapsUrl', () => {
  it('extracts the link from Google share text', () => {
    expect(extractGmapsUrl('Jay Fai\n327 Maha Chai Rd, Bangkok\nhttps://maps.app.goo.gl/AbC?g_st=ic')).toBe(
      'https://maps.app.goo.gl/AbC?g_st=ic',
    );
    expect(extractGmapsUrl('see https://evil.io/x and nothing else')).toBeNull();
  });
});

describe('readGmapsLink', () => {
  const redirect = (loc: string) => new Response(null, { status: 302, headers: { location: loc } });

  it('follows one 302 to the place URL', async () => {
    const f = vi.fn().mockResolvedValue(redirect(LIVE_PLACE));
    expect(await readGmapsLink('https://maps.app.goo.gl/mBtbC6qXLK2baGTV9', { fetchImpl: f })).toMatchObject({
      precision: 'exact',
    });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledWith(
      'https://maps.app.goo.gl/mBtbC6qXLK2baGTV9',
      expect.objectContaining({ redirect: 'manual', signal: expect.any(AbortSignal) }),
    );
  });
  it('unwraps consent.google.com?continue= without fetching it', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(redirect(`https://consent.google.com/ml?continue=${encodeURIComponent(PLACE)}`));
    expect((await readGmapsLink('https://maps.app.goo.gl/AbC', { fetchImpl: f }))!.cid).toBe('8015311305313251184');
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('returns null for a consent continue= that is off the allowlist', async () => {
    const f = vi
      .fn()
      .mockResolvedValue(redirect(`https://consent.google.com/ml?continue=${encodeURIComponent('http://169.254.169.254/')}`));
    expect(await readGmapsLink('https://maps.app.goo.gl/AbC', { fetchImpl: f })).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('stops at an off-allowlist Location', async () => {
    const f = vi.fn().mockResolvedValueOnce(redirect('http://169.254.169.254/latest'));
    expect(await readGmapsLink('https://maps.app.goo.gl/AbC', { fetchImpl: f })).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('gives up after 3 hops', async () => {
    const f = vi.fn().mockResolvedValue(redirect('https://maps.app.goo.gl/again'));
    expect(await readGmapsLink('https://maps.app.goo.gl/AbC', { fetchImpl: f })).toBeNull();
    expect(f).toHaveBeenCalledTimes(3);
  });
  it('resolves a relative Location against the current URL', async () => {
    const f = vi.fn().mockResolvedValueOnce(redirect('/next')).mockResolvedValueOnce(redirect(LIVE_PLACE));
    expect(await expandShortLink('https://maps.app.goo.gl/AbC', { fetchImpl: f })).toBe(LIVE_PLACE);
    expect(f.mock.calls[1][0]).toBe('https://maps.app.goo.gl/next');
  });
  it('does not fetch full maps URLs', async () => {
    const f = vi.fn();
    await readGmapsLink(PLACE, { fetchImpl: f });
    expect(f).not.toHaveBeenCalled();
  });
  it('does not fetch non-maps or lookalike hosts', async () => {
    const f = vi.fn();
    expect(await readGmapsLink('https://maps.app.goo.gl.evil.io/x', { fetchImpl: f })).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it.each([
    ['throws', () => Promise.reject(new Error('x'))],
    ['200', () => Promise.resolve(new Response('ok'))],
    ['404', () => Promise.resolve(new Response(null, { status: 404 }))],
  ])('returns null when fetch %s', async (_, impl) => {
    expect(await readGmapsLink('https://maps.app.goo.gl/AbC', { fetchImpl: vi.fn(impl) })).toBeNull();
  });
});
