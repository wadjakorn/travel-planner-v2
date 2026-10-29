import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearPlaceHover,
  getPlaceHover,
  hoverIdFor,
  setPlaceHover,
  subscribePlaceHover,
  type PlaceHover,
} from './hover-store';

afterEach(() => {
  clearPlaceHover('list');
  clearPlaceHover('map');
});

describe('place hover store', () => {
  it('set notifies once; an equal set does not', () => {
    const notify = vi.fn();
    const unsubscribe = subscribePlaceHover(notify);
    setPlaceHover({ dayId: 'd1', placeId: 'p1', source: 'list' });
    setPlaceHover({ dayId: 'd1', placeId: 'p1', source: 'list' });
    expect(notify).toHaveBeenCalledTimes(1);
    setPlaceHover({ dayId: 'd1', placeId: 'p2', source: 'list' });
    expect(notify).toHaveBeenCalledTimes(2);
    unsubscribe();
    setPlaceHover({ dayId: 'd1', placeId: 'p3', source: 'list' });
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it('clear only when the source matches', () => {
    setPlaceHover({ dayId: 'd1', placeId: 'p1', source: 'map' });
    clearPlaceHover('list');
    expect(getPlaceHover()).toEqual({ dayId: 'd1', placeId: 'p1', source: 'map' });
    clearPlaceHover('map');
    expect(getPlaceHover()).toBeNull();
  });

  it('clear with a placeId only clears that place', () => {
    setPlaceHover({ dayId: 'd1', placeId: 'p2', source: 'list' });
    const notify = vi.fn();
    const unsubscribe = subscribePlaceHover(notify);
    clearPlaceHover('list', 'p1');
    expect(getPlaceHover()?.placeId).toBe('p2');
    expect(notify).not.toHaveBeenCalled();
    clearPlaceHover('list', 'p2');
    expect(getPlaceHover()).toBeNull();
    expect(notify).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('hoverIdFor filters by day and source', () => {
    const h: PlaceHover = { dayId: 'd2', placeId: 'hotel-1-begin', source: 'map' };
    expect(hoverIdFor(h, 'd2', 'map')).toBe('hotel-1-begin');
    expect(hoverIdFor(h, 'd3', 'map')).toBeNull();
    expect(hoverIdFor(h, 'd2', 'list')).toBeNull();
    expect(hoverIdFor(h, undefined, 'map')).toBeNull();
    expect(hoverIdFor(null, 'd2', 'map')).toBeNull();
  });
});
