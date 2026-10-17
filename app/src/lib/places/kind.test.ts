import { describe, expect, it } from 'vitest';
import { kindFromCategories, kindFromOsm } from './kind';

describe('kindFromCategories', () => {
  it.each([
    [['accommodation.hotel'], 'hotel'],
    [['catering.cafe'], 'food'],
    [['catering'], 'food'],
    [['airport'], 'transit'],
    [['public_transport.train'], 'transit'],
    [['tourism.sights', 'religion.place_of_worship'], 'sight'],
    [[], 'sight'],
  ])('%j → %s', (cats, kind) => {
    expect(kindFromCategories(cats)).toBe(kind);
  });
  it('does not match a prefix inside another word', () => {
    expect(kindFromCategories(['cateringx'])).toBe('sight');
  });
});

describe('kindFromOsm', () => {
  it.each([
    ['tourism', 'hotel', 'hotel'],
    ['tourism', 'guest_house', 'hotel'],
    ['amenity', 'cafe', 'food'],
    ['shop', 'bakery', 'food'],
    ['aeroway', 'aerodrome', 'transit'],
    ['railway', 'station', 'transit'],
    ['amenity', 'bus_station', 'transit'],
    ['historic', 'temple', 'sight'],
    [undefined, undefined, 'sight'],
  ])('%s=%s → %s', (k, v, kind) => {
    expect(kindFromOsm(k, v)).toBe(kind);
  });
});
