import { describe, expect, it } from 'vitest';
import type { MapDay } from './day-augment';
import type { Pin } from './map-helpers';
import { coordKey, ghostPins, groupClickTarget, groupHoverId, groupLabel, groupPins, groupTitle } from './map-ghosts';

const pin = (id: string, idx: number, lat: number, lng: number, name = id): Pin =>
  ({ id, idx, kind: 'sight', lat, lng, name });
const day = (idx: number, pins: Pin[]): MapDay =>
  ({ id: `d${idx}`, idx, label: 'Mon', num: idx + 1, summaryDistance: null, summaryTime: null, pins, legs: [] });

describe('coordKey', () => {
  it('rounds to 6 decimals', () => expect(coordKey({ lat: 35.1, lng: 139.123456789 })).toBe('35.100000,139.123457'));
});

describe('groupPins', () => {
  it('merges identical coords, keeps order', () => {
    const g = groupPins([pin('h-b', 1, 35.1, 139.1), pin('a', 2, 35.2, 139.2), pin('h-e', 3, 35.1, 139.1)]);
    expect(g.map((x) => x.pins.map((p) => p.id))).toEqual([['h-b', 'h-e'], ['a']]);
    expect(groupLabel(g[0])).toBe('1 · 3');
    expect(groupLabel(g[1])).toBe('2');
  });
  it('does not merge pins 1 m apart', () => {
    expect(groupPins([pin('a', 1, 35.1, 139.1), pin('b', 2, 35.10001, 139.1)])).toHaveLength(2);
  });
});

describe('groupClickTarget', () => {
  const g = { key: 'k', lat: 0, lng: 0, pins: [pin('x', 1, 0, 0), pin('y', 4, 0, 0)] };
  it('inactive → first', () => expect(groupClickTarget(g, null)).toBe('x'));
  it('first active → next', () => expect(groupClickTarget(g, 'x')).toBe('y'));
  it('last active → itself (toggles off)', () => expect(groupClickTarget(g, 'y')).toBe('y'));
  it('active elsewhere → first', () => expect(groupClickTarget(g, 'other')).toBe('x'));
  it('hover follows the active pin in the group', () => {
    expect(groupHoverId(g, null)).toBe('x');
    expect(groupHoverId(g, 'y')).toBe('y');
    expect(groupHoverId(g, 'other')).toBe('x');
  });
  it('groupTitle joins pin titles', () => expect(groupTitle(g)).toBe('Stop 1: x; Stop 4: y'));
});

describe('ghostPins', () => {
  const days = [
    day(0, [pin('a', 1, 35.0, 139.0, 'Senso-ji'), pin('hotel-h-end', 2, 35.5, 139.5, 'Hotel')]),
    day(1, [pin('hotel-h-begin', 1, 35.5, 139.5, 'Hotel'), pin('b', 2, 35.2, 139.2, 'Hakone')]),
    day(2, [pin('c', 1, 35.3, 139.3, 'Kamakura')]),
  ];
  it('excludes the current day and coords it occupies', () => {
    const g = ghostPins(days, 1);
    expect(g.map((x) => x.name).sort()).toEqual(['Kamakura', 'Senso-ji']);
  });
  it('labels a shared coord with the nearest day', () => {
    const g = ghostPins(days, 2).find((x) => x.name === 'Hotel')!;
    expect(g.dayIdx).toBe(1);
  });
  it('ties go to the earlier day', () => {
    const tied = [
      day(0, [pin('h', 1, 1, 1, 'Early')]),
      day(1, [pin('x', 1, 2, 2, 'Mid')]),
      day(2, [pin('h2', 1, 1, 1, 'Late')]),
    ];
    const g = ghostPins(tied, 1).find((x) => x.key === coordKey({ lat: 1, lng: 1 }))!;
    expect([g.dayIdx, g.name]).toEqual([0, 'Early']);
  });
  it('unnamed stop falls back to Stop n', () => {
    const g = ghostPins([day(0, []), day(1, [{ id: 'z', idx: 3, kind: 'food', lat: 5, lng: 5 }])], 0);
    expect(g[0].name).toBe('Stop 3');
  });
  it('no other days → empty', () => expect(ghostPins([days[0]], 0)).toEqual([]));
});
