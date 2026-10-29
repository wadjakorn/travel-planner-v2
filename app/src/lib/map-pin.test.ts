import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import th from '@/messages/th.json';
import { makeT, withFallback } from './i18n-client';
import type { Pin } from './map-helpers';
import {
  GHOST_Z_INDEX,
  POPUP_Z_INDEX,
  PREVIEW_Z_INDEX,
  pinAnchor,
  pinPopupOffset,
  pinShape,
  pinTitle,
  pinZIndex,
  stopName,
} from './map-pin';

const t = makeT(en);

const p = (o: Partial<Pin> = {}): Pin => ({ id: 'a', idx: 2, kind: 'food', lat: 0, lng: 0, ...o });

describe('map pin rules', () => {
  it('pinTitle', () => {
    expect(pinTitle(p({ name: 'Tsuta Ramen', time: '19:30' }), t)).toBe('Stop 2: Tsuta Ramen, 19:30');
    expect(pinTitle(p({ name: 'Tsuta Ramen', time: null }), t)).toBe('Stop 2: Tsuta Ramen');
    expect(pinTitle(p(), t)).toBe('Stop 2');
    expect(pinTitle(p({ name: 'Chureito Pagoda', time: '8:30 AM' }), makeT(withFallback(en, th)))).toBe(
      'จุดที่ 2: Chureito Pagoda, 8:30 AM',
    );
  });

  it('stopName', () => {
    expect(stopName(p({ name: 'Senso-ji' }), t)).toBe('Senso-ji');
    expect(stopName(p(), t)).toBe('Stop 2');
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

  it('highlight draws above default, below active', () => {
    expect(pinZIndex(false, true)).toBe(50);
    expect(pinZIndex(false, true)).toBeGreaterThan(pinZIndex(false));
    expect(pinZIndex(true, true)).toBe(pinZIndex(true));
    expect(pinZIndex(true)).toBeGreaterThan(pinZIndex(false, true));
  });

  it('ghosts draw under every pin', () => {
    expect(GHOST_Z_INDEX).toBeGreaterThan(0);
    expect(GHOST_Z_INDEX).toBeLessThan(pinZIndex(false));
  });

  it('MapLibre popups draw above every marker', () => {
    expect(POPUP_Z_INDEX).toBeGreaterThan(PREVIEW_Z_INDEX);
  });
});
