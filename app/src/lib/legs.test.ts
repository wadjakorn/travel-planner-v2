import { describe, it, expect } from 'vitest';
import {
  START_KEY,
  pairKey,
  legNotesByPair,
  realignLegNotes,
  dayStartView,
  arriveForPlaces,
  legDayView,
  importLegRows,
} from './legs';
import { summarizeTripStatus } from '@/lib/api/trip-status';

const N = { note: null, durationMin: null };

describe('realignLegNotes', () => {
  it('copies a note to the leg whose pair existed before', () => {
    const before = legNotesByPair(
      ['a', 'b', 'c'],
      [
        { idx: 0, note: 'x', durationMin: null },
        { idx: 1, note: 'y', durationMin: null },
      ],
      { note: 's', durationMin: null },
    );
    const r = realignLegNotes(before, ['b', 'a', 'c'], [0, 1]);
    expect(r.segments).toEqual([
      { idx: 0, ...N },
      { idx: 1, ...N },
    ]);
    expect(r.start).toEqual(N);
  });

  it('keeps the note of a pair that survives a reorder', () => {
    const before = legNotesByPair(
      ['a', 'b', 'c', 'd'],
      [{ idx: 0, note: 'ab', durationMin: 5 }],
      N,
    );
    const r = realignLegNotes(before, ['c', 'a', 'b', 'd'], [0, 1, 2]);
    expect(r.segments[1]).toEqual({ idx: 1, note: 'ab', durationMin: 5 });
    expect(r.segments[0].note).toBeNull();
  });

  it('remove middle: the joined pair gets null, the surviving pair keeps its note', () => {
    const before = legNotesByPair(
      ['a', 'b', 'c', 'd'],
      [
        { idx: 0, note: 'ab', durationMin: null },
        { idx: 1, note: 'bc', durationMin: null },
        { idx: 2, note: 'cd', durationMin: 9 },
      ],
      N,
    );
    const r = realignLegNotes(before, ['a', 'c', 'd'], [0, 1]);
    expect(r.segments).toEqual([
      { idx: 0, ...N },
      { idx: 1, note: 'cd', durationMin: 9 },
    ]);
  });

  it('remove place 0: start_note resets because (START, b) is a new pair', () => {
    const before = legNotesByPair(['a', 'b'], [], { note: 'from hotel', durationMin: 10 });
    expect(before.get(pairKey(START_KEY, 'a'))).toEqual({ note: 'from hotel', durationMin: 10 });
    const r = realignLegNotes(before, ['b'], []);
    expect(r.start).toEqual(N);
  });

  it('stale row past the last leg is nulled', () => {
    const before = legNotesByPair(['a', 'b'], [{ idx: 0, note: 'x', durationMin: null }], N);
    const r = realignLegNotes(before, ['a', 'b'], [0, 1]);
    expect(r.segments).toEqual([
      { idx: 0, note: 'x', durationMin: null },
      { idx: 1, ...N },
    ]);
  });
});

describe('legNotesByPair', () => {
  it('skips stale rows with no destination', () => {
    const m = legNotesByPair(['a', 'b'], [{ idx: 5, note: 'z', durationMin: null }], N);
    expect([...m.keys()]).toEqual([pairKey(START_KEY, 'a')]);
  });
});

describe('dayStartView', () => {
  it('is null when startMode is null even if a note exists', () => {
    expect(dayStartView({ startMode: null, startDurationMin: 5, startNote: 'n' })).toBeNull();
    expect(dayStartView({ startMode: 'walk', startDurationMin: 5, startNote: 'n' })).toEqual({
      mode: 'walk',
      durationMin: 5,
      note: 'n',
    });
  });
});

describe('arriveForPlaces', () => {
  it('place 0 reads start, place j reads segment j-1, missing row → null', () => {
    const start = { mode: 'walk' as const, durationMin: 1, note: 's' };
    const r = arriveForPlaces(
      3,
      [{ idx: 1, mode: 'transit', note: 'n', durationMin: 7 }],
      start,
    );
    expect(r).toEqual([start, null, { mode: 'transit', note: 'n', durationMin: 7 }]);
  });
});

describe('legDayView', () => {
  it('strips start* columns and attaches arrive per place', () => {
    const v = legDayView({
      id: 'd',
      startMode: 'walk' as const,
      startDurationMin: 3,
      startNote: 'hi',
      places: [{ id: 'p0' }, { id: 'p1' }],
      segments: [{ idx: 0, mode: 'drive' as const, note: null, durationMin: null }],
    });
    expect('startMode' in v).toBe(false);
    expect('startDurationMin' in v).toBe(false);
    expect('startNote' in v).toBe(false);
    expect(v.start).toEqual({ mode: 'walk', durationMin: 3, note: 'hi' });
    expect(v.places[0].arrive).toEqual(v.start);
    expect(v.places[1].arrive).toEqual({ mode: 'drive', durationMin: null, note: null });
    expect(v.id).toBe('d');
  });
});

describe('importLegRows', () => {
  it('fills every leg; missing arrive → drive with null note', () => {
    const r = importLegRows(3, [null, { mode: 'transit', durationMin: 150, note: 'Shinkansen' }, null]);
    expect(r.start).toBeNull();
    expect(r.segments).toEqual([
      { idx: 0, mode: 'transit', distance: '', time: '', note: 'Shinkansen', durationMin: 150 },
      { idx: 1, mode: 'drive', distance: '', time: '', note: null, durationMin: null },
    ]);
  });

  it('with one place emits no segment rows', () => {
    expect(importLegRows(1, [null]).segments).toEqual([]);
  });
});

describe('API day view ordering', () => {
  it('arrive is derived before the ?status filter', () => {
    const day = {
      id: 'd',
      startMode: 'walk' as const,
      startDurationMin: 5,
      startNote: null,
      places: [
        { id: 'p0', status: 'planned' },
        { id: 'p1', status: 'planned' },
        { id: 'p2', status: 'tbd' },
      ],
      segments: [
        { idx: 0, mode: 'drive' as const, note: null, durationMin: null },
        { idx: 1, mode: 'transit' as const, note: 'train', durationMin: 40 },
      ],
    };
    const { days } = summarizeTripStatus([day].map(legDayView), 'tbd');
    expect(days[0].places).toHaveLength(1);
    expect(days[0].places[0].arrive).toEqual({ mode: 'transit', durationMin: 40, note: 'train' });
    expect(days[0].start).toEqual({ mode: 'walk', durationMin: 5, note: null });
    expect('startMode' in days[0]).toBe(false);
  });
});
