import { describe, expect, it } from 'vitest';
import type { MapLeg, Pin } from './map-helpers';
import {
  ARROW_SIZE,
  arrowBitmap,
  arrowImageId,
  googleDash,
  legsGeoJSON,
  modeFromArrowImageId,
  routeStyle,
} from './map-route';

const pin = (id: string, lat: number, lng: number): Pin => ({ id, idx: 1, kind: 'sight', lat, lng });

describe('map route helpers', () => {
  it('routeStyle: mode color + dash in line-width units', () => {
    expect(routeStyle('walk')).toEqual({ color: '#15803d', dash: [2, 6] });
    expect(routeStyle('drive')).toEqual({ color: '#1d4ed8', dash: [6, 4] });
    expect(routeStyle('transit')).toEqual({ color: '#7c3aed', dash: null });
    expect(routeStyle(null)).toEqual({ color: '#64748b', dash: [1, 3] });
  });

  it('googleDash converts width units to symbol scale/repeat', () => {
    expect(googleDash(routeStyle('walk'))).toEqual({ scale: 3, repeatPx: 24 }); // 2*3/2, (2+6)*3
    expect(googleDash(routeStyle('drive'))).toEqual({ scale: 9, repeatPx: 30 });
    expect(googleDash(routeStyle(null))).toEqual({ scale: 1.5, repeatPx: 12 });
    expect(googleDash(routeStyle('transit'))).toBeNull();
  });

  it('legsGeoJSON draws [lng,lat] lines between pin positions', () => {
    const legs: MapLeg[] = [{ from: 0, to: 1, mode: null }, { from: 1, to: 2, mode: 'walk' }];
    const fc = legsGeoJSON([pin('a', 35, 139), pin('b', 36, 140), pin('c', 36.5, 140)], legs);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0].geometry).toEqual({ type: 'LineString', coordinates: [[139, 35], [140, 36]] });
    expect(fc.features[0].properties).toEqual({ mode: 'none', color: '#64748b' });
    expect(fc.features[1].properties).toEqual({ mode: 'walk', color: '#15803d' });
  });

  it('legsGeoJSON skips a leg whose pin is missing (stale legs during a day swap)', () => {
    expect(legsGeoJSON([pin('a', 35, 139)], [{ from: 0, to: 1, mode: 'drive' }]).features).toEqual([]);
  });

  it('arrow image ids round-trip; basemap ids are not ours', () => {
    for (const m of ['walk', 'drive', 'transit', 'none'] as const) {
      expect(modeFromArrowImageId(arrowImageId(m))).toBe(m);
    }
    expect(arrowImageId('drive')).toBe('tp-route-arrow-drive');
    expect(modeFromArrowImageId('some-basemap-icon')).toBeNull();
    expect(modeFromArrowImageId('tp-route-arrow-boat')).toBeNull();
  });

  it('arrowBitmap: filled east-pointing triangle, white rim, clear corners', () => {
    const b = arrowBitmap(ARROW_SIZE, '#15803d');
    const px = (x: number, y: number) => Array.from(b.data.slice((y * 24 + x) * 4, (y * 24 + x) * 4 + 4));
    expect([b.width, b.height, b.data.length]).toEqual([24, 24, 24 * 24 * 4]);
    expect(px(14, 12)).toEqual([0x15, 0x80, 0x3d, 255]);
    expect(px(20, 12)).toEqual([255, 255, 255, 255]); // rim beyond the tip
    expect(px(0, 0)[3]).toBe(0);
    expect(px(23, 0)[3]).toBe(0);
    expect(px(23, 23)[3]).toBe(0);
  });
});
