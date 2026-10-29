import { describe, it, expect } from 'vitest';
import { railItemIds } from './trip-rail-items';

describe('railItemIds', () => {
  it('owner sees settings last', () =>
    expect(railItemIds({ isOwner: true, showSettings: true })).toEqual([
      'itinerary',
      'calendar',
      'bookings',
      'budget',
      'notes',
      'settings',
    ]));
  it('non-owner has no settings', () =>
    expect(railItemIds({ isOwner: false, showSettings: true })).toEqual([
      'itinerary',
      'calendar',
      'bookings',
      'budget',
      'notes',
    ]));
  it('showSettings=false hides it for owners too', () =>
    expect(railItemIds({ isOwner: true, showSettings: false })).not.toContain('settings'));
});
