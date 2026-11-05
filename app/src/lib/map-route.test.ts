import { describe, expect, it } from 'vitest';
import { fakeLegInfo } from './leg-info.test-helpers';
import { metersBetween } from './map-preview';
import { LEG_COLORS, type LatLng, type MapLeg, type MapRide, type Pin } from './map-helpers';
import { ARC_BADGE_MIN_M, ARC_BEND, ARC_SEGMENTS, CAPSULE_MIN_PX, activeArcKey, arcByKey, badgeLabelled, metersPerPixel, arcMid, arcPath, legSlot, legStyle, legsGeoJSON, rideArcs, rideEnds, ridesGeoJSON, routeArcs } from './map-route';

const pin = (id: string, lat: number, lng: number): Pin => ({ id, idx: 1, kind: 'sight', lat, lng });

// Web-Mercator, same as the module, to check the bend independent of latitude.
const merc = (p: LatLng) => {
  const r = Math.PI / 180;
  return { x: p.lng * r, y: Math.log(Math.tan(Math.PI / 4 + (p.lat * r) / 2)) };
};
const cross = (a: LatLng, b: LatLng, m: LatLng) =>
  (b.lng - a.lng) * (m.lat - a.lat) - (b.lat - a.lat) * (m.lng - a.lng);

const A = { lat: 35.68, lng: 139.76 };
const B = { lat: 35.71, lng: 139.8 };

describe('map route arcs', () => {
  it('arcPath: ARC_SEGMENTS + 1 points, exact endpoints', () => {
    const path = arcPath(A, B);
    expect(path).toHaveLength(ARC_SEGMENTS + 1);
    expect(path[0]).toEqual(A);
    expect(path[ARC_SEGMENTS]).toEqual(B);
  });

  it('arcPath: zero-length leg returns the two endpoints', () => {
    expect(arcPath(A, { ...A })).toEqual([A, A]);
  });

  it('arcMid bends left of travel by half the control offset (in Mercator)', () => {
    const m = arcMid(A, B);
    expect(cross(A, B, m)).toBeGreaterThan(0);
    const [pa, pb, pm] = [merc(A), merc(B), merc(m)];
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const off = Math.hypot(pm.x - (pa.x + pb.x) / 2, pm.y - (pa.y + pb.y) / 2);
    expect(off / len).toBeCloseTo(ARC_BEND / 2, 6);
    expect(arcPath(A, B)[ARC_SEGMENTS / 2].lat).toBeCloseTo(m.lat, 9);
  });

  it('A→B and B→A curve apart (out-and-back stays readable)', () => {
    expect(cross(A, B, arcMid(A, B))).toBeGreaterThan(0);
    expect(cross(A, B, arcMid(B, A))).toBeLessThan(0);
  });

  it('a leg across the antimeridian takes the short way', () => {
    const path = arcPath({ lat: -17, lng: 179 }, { lat: -16, lng: -179 });
    for (const p of path) expect(Math.abs(p.lng - 180)).toBeLessThanOrEqual(2);
  });

  it('routeArcs: badge only for a stored mode on legs >= ARC_BADGE_MIN_M', () => {
    // ~0.0045° lat ≈ 500 m; ~0.0009° ≈ 100 m.
    const pins = [pin('a', 35, 139), pin('b', 35.0045, 139), pin('c', 35.0054, 139)];
    const legs: MapLeg[] = [
      { from: 0, to: 1, mode: 'walk', slot: 0, info: fakeLegInfo() },
      { from: 1, to: 2, mode: 'walk', slot: 0, info: fakeLegInfo() },
      { from: 0, to: 1, mode: null, slot: 0, info: fakeLegInfo() },
    ];
    expect(ARC_BADGE_MIN_M).toBe(300);
    const arcs = routeArcs(pins, legs);
    expect(arcs.map((a) => [a.key, a.mode, a.showBadge])).toEqual([
      ['a>b', 'walk', true],
      ['b>c', 'walk', false],
      ['a>b', null, false],
    ]);
    expect(arcs[0].mid).toEqual(arcMid(pins[0], pins[1]));
    expect(arcs[0].path).toHaveLength(ARC_SEGMENTS + 1);
  });

  it('routeArcs carries each leg info', () => {
    const legs: MapLeg[] = [{ from: 0, to: 1, mode: 'walk', slot: 0, info: fakeLegInfo() }];
    const arcs = routeArcs([pin('a', 35, 139), pin('b', 35.01, 139.01)], legs);
    expect(arcs[0].info).toBe(legs[0].info);
  });

  it('arcByKey finds an arc and ignores junk', () => {
    const legs: MapLeg[] = [{ from: 0, to: 1, mode: 'walk', slot: 0, info: fakeLegInfo() }];
    const arcs = routeArcs([pin('a', 35, 139), pin('b', 35.01, 139.01)], legs);
    expect(arcByKey(arcs, 'a>b')).toBe(arcs[0]);
    expect(arcByKey(arcs, 'x>y')).toBeNull();
    expect(arcByKey(arcs, undefined)).toBeNull();
    expect(arcByKey(arcs, 42)).toBeNull();
  });

  it('routeArcs skips a leg whose pin is missing (stale legs during a day swap)', () => {
    expect(routeArcs([pin('a', 35, 139)], [{ from: 0, to: 1, mode: 'drive', slot: 0, info: fakeLegInfo() }])).toEqual([]);
  });

  it('legsGeoJSON: one [lng,lat] LineString per arc', () => {
    const arcs = routeArcs([pin('a', 35, 139), pin('b', 36, 140)], [{ from: 0, to: 1, mode: null, slot: 0, info: fakeLegInfo() }]);
    const fc = legsGeoJSON(arcs);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    const coords = fc.features[0].geometry.coordinates;
    expect(coords).toHaveLength(ARC_SEGMENTS + 1);
    expect(coords[0]).toEqual([139, 35]);
    expect(coords[ARC_SEGMENTS]).toEqual([140, 36]);
    expect(fc.features[0].properties).toEqual({ key: 'a>b', color: LEG_COLORS[0], to: 'b' });
  });

  it('routeArcs: each arc names its destination pin, and so does its feature', () => {
    const pins = [pin('a', 35.68, 139.76), pin('b', 35.71, 139.8), pin('c', 35.73, 139.82)];
    const legs: MapLeg[] = [
      { from: 0, to: 1, mode: 'walk', slot: 0, info: fakeLegInfo() },
      { from: 1, to: 2, mode: null, slot: 1, info: fakeLegInfo() },
    ];
    const arcs = routeArcs(pins, legs);
    expect(arcs.map((a) => a.toId)).toEqual(['b', 'c']);
    expect(arcs[1].toPin).toBe(pins[2]);
    expect(legsGeoJSON(arcs).features.map((f) => f.properties.to)).toEqual(['b', 'c']);
  });
});

describe('leg capsule (TP-0152)', () => {
  it('metersPerPixel matches Web Mercator', () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(156543.03392, 2);
    expect(Math.abs(metersPerPixel(60, 1) - metersPerPixel(0, 1) / 2)).toBeLessThan(1e-6);
  });

  it('badgeLabelled by on-screen length', () => {
    expect(CAPSULE_MIN_PX).toBe(120);
    // ~15.6 m/px at lat 35 zoom 13 → 1000 m ≈ 64 px; zoom 15 ≈ 256 px.
    expect(badgeLabelled(1000, 35, 13)).toBe(false);
    expect(badgeLabelled(1000, 35, 15)).toBe(true);
  });

  it('activeArcKey picks the leg into the selected stop', () => {
    const pins = [pin('a', 35, 139), pin('b', 35.01, 139.01), pin('c', 35.02, 139.02)];
    const legs: MapLeg[] = [
      { from: 0, to: 1, mode: 'walk', slot: 0, info: fakeLegInfo() },
      { from: 1, to: 2, mode: 'walk', slot: 1, info: fakeLegInfo() },
    ];
    const arcs = routeArcs(pins, legs);
    expect(activeArcKey(arcs, 'c')).toBe('b>c');
    expect(activeArcKey(arcs, 'b')).toBe('a>b');
    expect(activeArcKey(arcs, 'a')).toBeNull();
    expect(activeArcKey(arcs, 'zzz')).toBeNull();
    expect(activeArcKey(arcs, null)).toBeNull();
    expect(activeArcKey([], 'b')).toBeNull();
  });

  it('routeArcs carries chordM', () => {
    const a = pin('a', 35, 139);
    const b = pin('b', 35.0045, 139);
    const [arc] = routeArcs([a, b], [{ from: 0, to: 1, mode: 'walk', slot: 0, info: fakeLegInfo() }]);
    expect(arc.chordM).toBeCloseTo(metersBetween(a, b), 6);
    expect(arc.chordM).toBeGreaterThan(450);
    expect(arc.chordM).toBeLessThan(550);
  });
});

describe('legSlot', () => {
  const P = { lat: 35, lng: 139 };
  const Q = { lat: 35.01, lng: 139 };

  it('cycles by display index', () => {
    expect([0, 1, 9, 10, 11].map((i) => legSlot(i, P, Q))).toEqual([0, 1, 9, 0, 1]);
  });

  it('is null when the map draws no line', () => {
    expect(legSlot(0, P, { lat: null, lng: null })).toBeNull();
    expect(legSlot(0, { lat: null, lng: 139 }, Q)).toBeNull();
    expect(legSlot(0, P, undefined)).toBeNull();
    expect(legSlot(0, P, { ...P })).toBeNull(); // < 10 m
  });

  it('legStyle points at the theme-aware token', () => {
    expect(legStyle(0)).toEqual({ '--leg': 'var(--leg-1)' });
    expect(legStyle(9)).toEqual({ '--leg': 'var(--leg-10)' });
  });
});

describe('leg colour on arcs', () => {
  it('routeArcs and legsGeoJSON carry the slot colour', () => {
    const pins = [pin('a', 35, 139), pin('b', 35.01, 139)];
    const arcs = routeArcs(pins, [{ from: 0, to: 1, mode: 'walk', slot: 2, info: fakeLegInfo() }]);
    expect(arcs[0].color).toBe(LEG_COLORS[2]);
    expect(legsGeoJSON(arcs).features[0].properties.color).toBe(LEG_COLORS[2]);
  });
});

describe('ride arcs', () => {
  const BKK = { lat: 13.69, lng: 100.75 };
  const KIX = { lat: 34.43, lng: 135.23 };
  const r = (id: string, from: LatLng | null, to: LatLng | null, type: MapRide['type'] = 'flight'): MapRide => ({
    id, type, from, to, fromLabel: null, toLabel: null,
  });

  it('one arc per ride with both ends, reusing arcPath/arcMid', () => {
    const arcs = rideArcs([r('f', BKK, KIX), r('o', null, KIX, 'train')]);
    expect(arcs).toEqual([{ key: 'ride:f', path: arcPath(BKK, KIX), mid: arcMid(BKK, KIX), type: 'flight' }]);
  });

  it('a one-ended ride has one end and no arc', () => {
    const rides = [r('o', null, KIX, 'train')];
    expect(rideArcs(rides)).toEqual([]);
    expect(rideEnds(rides)).toEqual([{ key: 'ride:o:to', pos: KIX, end: 'to' }]);
  });

  it('lists both ends of a located ride', () => {
    expect(rideEnds([r('f', BKK, KIX)])).toEqual([
      { key: 'ride:f:from', pos: BKK, end: 'from' },
      { key: 'ride:f:to', pos: KIX, end: 'to' },
    ]);
  });

  it('ridesGeoJSON: one [lng, lat] LineString per arc', () => {
    const arcs = rideArcs([r('f', BKK, KIX)]);
    const fc = ridesGeoJSON(arcs);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties).toEqual({ key: 'ride:f' });
    expect(fc.features[0].geometry.coordinates[0]).toEqual([BKK.lng, BKK.lat]);
    expect(fc.features[0].geometry.coordinates.at(-1)).toEqual([KIX.lng, KIX.lat]);
  });
});
