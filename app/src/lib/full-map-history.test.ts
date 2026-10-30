import { describe, expect, it } from 'vitest';
import { FULLMAP_KEY, LIST_KEY, closeAction, isFullMapEntry, isMapListEntry } from './full-map-history';

const base = { lastMapHref: '/trip/t?day=1', currentHref: '/trip/t?day=1' };

describe('isFullMapEntry', () => {
  it('reads the tag only', () => {
    expect(isFullMapEntry({ [FULLMAP_KEY]: 1, __NA: true })).toBe(true);
    expect(isFullMapEntry({ __NA: true })).toBe(false);
    expect(isFullMapEntry(null)).toBe(false);
    expect(isFullMapEntry('x')).toBe(false);
    expect(isFullMapEntry({ [LIST_KEY]: 1 })).toBe(false);
    expect(isMapListEntry({ [LIST_KEY]: 1 })).toBe(true);
    expect(isMapListEntry({ [FULLMAP_KEY]: 1 })).toBe(false);
  });
});

describe('closeAction', () => {
  it('does nothing when no map entry is owned', () => {
    expect(closeAction({ ...base, landedState: { __NA: true }, owns: false })).toEqual({ close: false, syncTo: null });
  });

  it('ignores landing on a (stale) tagged entry', () => {
    expect(closeAction({ ...base, landedState: { [FULLMAP_KEY]: 1 }, owns: true })).toEqual({ close: false, syncTo: null });
  });

  it('closes on an untagged, null or foreign landing', () => {
    for (const landedState of [{ __NA: true }, null, 'x']) {
      expect(closeAction({ ...base, landedState, owns: true }).close).toBe(true);
    }
  });

  it('syncs only when the landed URL differs from the map URL', () => {
    expect(closeAction({ ...base, landedState: null, owns: true }).syncTo).toBeNull();
    expect(
      closeAction({ landedState: null, owns: true, lastMapHref: '/trip/t?day=2&placeId=p', currentHref: '/trip/t?day=1' })
        .syncTo,
    ).toBe('/trip/t?day=2&placeId=p');
    expect(closeAction({ landedState: null, owns: true, lastMapHref: null, currentHref: '/x' }).syncTo).toBeNull();
    expect(
      closeAction({ landedState: null, owns: true, lastMapHref: '/trip/t?day=2', currentHref: '/trip/t/calendar' }),
    ).toEqual({ close: true, syncTo: null });
  });
});
