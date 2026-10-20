import { describe, expect, it } from 'vitest';
import { extractGmapsUrl, isGmapsUrl, parseGmapsUrl } from './gmaps-link';
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

describe('extractGmapsUrl', () => {
  it('extracts the link from Google share text', () => {
    expect(extractGmapsUrl('Jay Fai\n327 Maha Chai Rd, Bangkok\nhttps://maps.app.goo.gl/AbC?g_st=ic')).toBe(
      'https://maps.app.goo.gl/AbC?g_st=ic',
    );
    expect(extractGmapsUrl('see https://evil.io/x and nothing else')).toBeNull();
  });
});
