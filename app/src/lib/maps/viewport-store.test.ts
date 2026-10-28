import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearMapViewport,
  getMapViewport,
  setMapViewport,
  subscribeMapViewport,
  viewportBiasFor,
} from './viewport-store';

const viewport = { tripId: 'trip-1', dayId: 'day-1', bbox: { south: 1, west: 2, north: 3, east: 4 } };

afterEach(() => clearMapViewport());

describe('map viewport store', () => {
  it('notifies only on meaningful set and clear changes', () => {
    const notify = vi.fn();
    const unsubscribe = subscribeMapViewport(notify);
    setMapViewport(viewport);
    setMapViewport({ ...viewport, bbox: { ...viewport.bbox } });
    clearMapViewport();
    clearMapViewport();
    expect(notify).toHaveBeenCalledTimes(2);
    expect(getMapViewport()).toBeNull();
    unsubscribe();
  });
});

describe('viewportBiasFor', () => {
  it.each([
    [{ pathname: '/trip/trip-2', visible: true, dayId: 'day-1' }],
    [{ pathname: '/trip/trip-1/hotels', visible: true, dayId: 'day-1' }],
    [{ pathname: '/trip/trip-1', visible: false, dayId: 'day-1' }],
    [{ pathname: '/trip/trip-1', visible: true, dayId: 'day-2' }],
    [{ pathname: '/trip/trip-1', visible: true }],
  ])('returns null when its gate does not match: %o', (options) => {
    expect(viewportBiasFor(viewport, options)).toBeNull();
  });

  it('returns the viewport bbox for the matching itinerary day', () => {
    expect(viewportBiasFor(viewport, { pathname: '/trip/trip-1', visible: true, dayId: 'day-1' })).toEqual(viewport.bbox);
    expect(viewportBiasFor(null, { pathname: '/trip/trip-1', visible: true, dayId: 'day-1' })).toBeNull();
  });
});
