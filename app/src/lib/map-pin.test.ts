import { describe, expect, it } from 'vitest';
import type { Pin } from './map-helpers';
import { POPUP_Z_INDEX, PREVIEW_Z_INDEX, pinAnchor, pinPopupOffset, pinShape, pinTitle, pinZIndex } from './map-pin';

const p = (o: Partial<Pin> = {}): Pin => ({ id: 'a', idx: 2, kind: 'food', lat: 0, lng: 0, ...o });

describe('map pin rules', () => {
  it('pinTitle', () => {
    expect(pinTitle(p({ name: 'Tsuta Ramen', time: '19:30' }))).toBe('Stop 2: Tsuta Ramen, 19:30');
    expect(pinTitle(p({ name: 'Tsuta Ramen', time: null }))).toBe('Stop 2: Tsuta Ramen');
    expect(pinTitle(p())).toBe('Stop 2');
  });

  it('stay pins are centered squares; others bottom-anchored drops', () => {
    expect([pinShape('hotel'), pinAnchor('hotel')]).toEqual(['square', 'center']);
    expect([pinShape('sight'), pinAnchor('sight')]).toEqual(['drop', 'bottom']);
    expect([pinShape('food'), pinAnchor('transit')]).toEqual(['drop', 'bottom']);
  });

  it('pinPopupOffset', () => {
    expect(pinPopupOffset('food', false)).toBe(52);
    expect(pinPopupOffset('food', true)).toBe(62);
    expect(pinPopupOffset('hotel', false)).toBe(24);
    expect(pinPopupOffset('hotel', true)).toBe(30);
  });

  it('active pin draws above the rest; preview above all', () => {
    expect(pinZIndex(true)).toBeGreaterThan(pinZIndex(false));
    expect(PREVIEW_Z_INDEX).toBeGreaterThan(pinZIndex(true));
  });

  it('MapLibre popups draw above every marker', () => {
    expect(POPUP_Z_INDEX).toBeGreaterThan(PREVIEW_Z_INDEX);
  });
});
