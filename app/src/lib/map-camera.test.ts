import { describe, expect, it } from 'vitest';
import { fitPadding, mapTopInset } from './map-helpers';
import {
  ACTIVE_CARD_CLEARANCE,
  MIN_SAFE,
  PREVIEW_CARD_CLEARANCE,
  activeSafeArea,
  offsetCenter,
  previewPadding,
  previewSafeArea,
  revealPan,
  toViewPx,
} from './map-camera';

const pad48 = { top: 48, right: 48, bottom: 48, left: 48 };

describe('constants', () => {
  it('card clearances include the bottom-anchored pin popup offsets (62 / 52)', () => {
    expect(ACTIVE_CARD_CLEARANCE).toEqual({ top: 330, side: 136 });
    expect(PREVIEW_CARD_CLEARANCE).toEqual({ top: 370, side: 150 });
    expect(MIN_SAFE).toBe(120);
  });
});

describe('toViewPx', () => {
  it('puts the camera centre in the middle of the view', () => {
    const cam = { center: { lat: 35.66, lng: 139.7 }, zoom: 13 };
    expect(toViewPx(cam.center, cam, { width: 800, height: 600 })).toEqual({ x: 400, y: 300 });
  });
  it('projects on the 256-px Web Mercator world', () => {
    const p = toViewPx({ lat: 0, lng: 90 }, { center: { lat: 0, lng: 0 }, zoom: 1 }, { width: 512, height: 512 });
    expect(p.x).toBeCloseTo(384, 6);
    expect(p.y).toBeCloseTo(256, 6);
  });
  it('clamps the poles', () => {
    const p = toViewPx({ lat: 90, lng: 0 }, { center: { lat: 0, lng: 0 }, zoom: 0 }, { width: 256, height: 256 });
    expect(Number.isFinite(p.y)).toBe(true);
    expect(p.y).toBeCloseTo(0, 3);
  });
});

describe('offsetCenter', () => {
  it('is the centre after panBy(dx, dy)', () => {
    const cam = { center: { lat: 35.66, lng: 139.7 }, zoom: 13 };
    const size = { width: 800, height: 600 };
    const p = toViewPx(offsetCenter(cam, 120, -80), cam, size);
    expect(p.x).toBeCloseTo(520, 6);
    expect(p.y).toBeCloseTo(220, 6);
  });
});

describe('revealPan', () => {
  const size = { width: 800, height: 800 };
  it('does not move a point inside the safe area', () =>
    expect(revealPan({ x: 400, y: 400 }, size, pad48)).toEqual({ dx: 0, dy: 0 }));
  it('pans minimally on each axis', () => {
    expect(revealPan({ x: 10, y: 400 }, size, pad48)).toEqual({ dx: -38, dy: 0 });
    expect(revealPan({ x: 400, y: 790 }, size, pad48)).toEqual({ dx: 0, dy: 38 });
  });
  it('leaves room for the active card above the pin', () =>
    expect(revealPan({ x: 400, y: 100 }, size, activeSafeArea(pad48, true))).toEqual({ dx: 0, dy: -230 }));
  it('centres the point on an axis whose safe span collapsed', () =>
    expect(revealPan({ x: 50, y: 50 }, { width: 200, height: 200 }, { top: 100, right: 48, bottom: 100, left: 48 })).toEqual({
      dx: -50,
      dy: -50,
    }));
});

describe('activeSafeArea', () => {
  it('adds card clearance when the card shows', () =>
    expect(activeSafeArea(fitPadding(true), true)).toEqual({ top: 330, right: 136, bottom: 240, left: 136 }));
  it('md+: the card also clears the day bar', () =>
    expect(activeSafeArea(fitPadding(false), true, mapTopInset(false)).top).toBe(330 + 62));
  it('is the padding itself when the card is hidden', () => {
    const p = fitPadding(true);
    expect(activeSafeArea(p, false)).toBe(p);
  });
});

describe('previewSafeArea', () => {
  it('leaves room for the preview card', () =>
    expect(previewSafeArea(fitPadding(true))).toEqual({ top: 370, right: 150, bottom: 240, left: 150 }));
  it('md+: the card also clears the day bar', () =>
    expect(previewSafeArea(fitPadding(false), mapTopInset(false)).top).toBe(370 + 62));
  it('a POI tapped mid-screen on a phone does not move the map', () =>
    expect(revealPan({ x: 195, y: 500 }, { width: 390, height: 844 }, previewSafeArea(fitPadding(true)))).toEqual({
      dx: 0,
      dy: 0,
    }));
});

describe('previewPadding', () => {
  it('desktop: card clearance on top and sides', () =>
    expect(previewPadding({ width: 1000, height: 800 }, false)).toEqual({ top: 370 + 62, right: 150, bottom: 48, left: 150 }));
  it('phone with the strip: narrower sides, strip at the bottom', () =>
    expect(previewPadding({ width: 390, height: 844 }, true)).toEqual({ top: 370, right: 135, bottom: 240, left: 135 }));
  it('null when the map is too short to frame anything', () =>
    expect(previewPadding({ width: 390, height: 600 }, true)).toBeNull());
});
