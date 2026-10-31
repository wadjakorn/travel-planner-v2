import { describe, expect, it } from 'vitest';
import { FULLMAP_KEY, LIST_KEY, closeAction, dominantDay, isFullMapEntry, isMapListEntry, returnScrollTarget, sameStop, shallowEntryState } from './full-map-history';

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

describe('shallowEntryState', () => {
  it('keeps the map tag and Next\'s tree, drops __NA so the URL syncs into the router', () => {
    expect(shallowEntryState({ __NA: true, tree: 'x', [FULLMAP_KEY]: 1 }, 'replace')).toEqual({ tree: 'x', [FULLMAP_KEY]: 1 });
    expect(shallowEntryState(null, 'replace')).toEqual({});
  });

  it('a pushed entry inherits no tag', () => {
    expect(shallowEntryState({ __NA: true, [FULLMAP_KEY]: 1, [LIST_KEY]: 1 }, 'push')).toEqual({});
  });
});

describe('sameStop', () => {
  it('compares day and place, whatever the spelling', () => {
    expect(sameStop('/t/1', '/t/1?day=0')).toBe(true);
    expect(sameStop('?placeId=a&day=2', '/t/1?day=2&placeId=a')).toBe(true);
    expect(sameStop('/t/1?day=1', '/t/1?day=2')).toBe(false);
    expect(sameStop('/t/1?day=1', '/t/1?day=1&placeId=a')).toBe(false);
  });
});

describe('returnScrollTarget', () => {
  it('keeps the list\'s place when the stop did not change', () => {
    expect(returnScrollTarget('/t/1?day=1', '/t/1?day=1', '/t/1?day=1')).toBeNull();
    expect(returnScrollTarget('/t/1', '/t/1?day=0', '/t/1')).toBeNull();
  });

  it('scrolls when it changed, or with nothing to compare against', () => {
    expect(returnScrollTarget('/t/1?day=1', '/t/1?day=1&placeId=a', '/t/1?day=1')).toBe('/t/1?day=1&placeId=a');
    expect(returnScrollTarget(null, '/t/1?day=1', '/t/1?day=1')).toBe('/t/1?day=1');
  });

  it('never scrolls a landing on another page', () => {
    expect(returnScrollTarget(null, '/t/1?day=1', '/t/1/calendar')).toBeNull();
    expect(returnScrollTarget(null, null, '/t/1')).toBeNull();
  });
});

describe('dominantDay', () => {
  it('picks the day covering most of the column, not the one under its centre', () => {
    const days = [{ idx: 0, top: -500, bottom: 319 }, { idx: 1, top: 368, bottom: 1400 }];
    expect(dominantDay(days, 0, 600)).toBe(0);
    expect(dominantDay(days, -300, 300)).toBe(0);
    expect(dominantDay(days, 300, 900)).toBe(1);
  });

  it('is null with no day on screen', () => {
    expect(dominantDay([], 0, 600)).toBeNull();
    expect(dominantDay([{ idx: 0, top: 700, bottom: 900 }], 0, 600)).toBeNull();
  });
});
