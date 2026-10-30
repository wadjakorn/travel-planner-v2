import { describe, expect, it } from 'vitest';
import { LEG_COLORS, type LatLng, type MapLeg, type Pin } from './map-helpers';
import { ARC_BADGE_MIN_M, ARC_BEND, ARC_SEGMENTS, arcMid, arcPath, legSlot, legStyle, legsGeoJSON, routeArcs } from './map-route';

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
      { from: 0, to: 1, mode: 'walk', slot: 0 },
      { from: 1, to: 2, mode: 'walk', slot: 0 },
      { from: 0, to: 1, mode: null, slot: 0 },
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

  it('routeArcs skips a leg whose pin is missing (stale legs during a day swap)', () => {
    expect(routeArcs([pin('a', 35, 139)], [{ from: 0, to: 1, mode: 'drive', slot: 0 }])).toEqual([]);
  });

  it('legsGeoJSON: one [lng,lat] LineString per arc', () => {
    const arcs = routeArcs([pin('a', 35, 139), pin('b', 36, 140)], [{ from: 0, to: 1, mode: null, slot: 0 }]);
    const fc = legsGeoJSON(arcs);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    const coords = fc.features[0].geometry.coordinates;
    expect(coords).toHaveLength(ARC_SEGMENTS + 1);
    expect(coords[0]).toEqual([139, 35]);
    expect(coords[ARC_SEGMENTS]).toEqual([140, 36]);
    expect(fc.features[0].properties).toEqual({ key: 'a>b' });
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
    const arcs = routeArcs(pins, [{ from: 0, to: 1, mode: 'walk', slot: 2 }]);
    expect(arcs[0].color).toBe(LEG_COLORS[2]);
    expect(legsGeoJSON(arcs).features[0].properties.color).toBe(LEG_COLORS[2]);
  });
});
