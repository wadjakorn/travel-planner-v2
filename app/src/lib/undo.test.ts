import { describe, it, expect } from 'vitest';
import { UNDO_WINDOW_MS, isUndoable } from './undo';

const now = new Date('2026-10-30T12:00:00.000Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('isUndoable', () => {
  it('is a 10-minute window', () => {
    expect(UNDO_WINDOW_MS).toBe(600_000);
  });

  it('refuses a booking that is not deleted', () => {
    expect(isUndoable(null, now)).toBe(false);
  });

  it('accepts a delete 9:59 ago', () => {
    expect(isUndoable(ago(9 * 60_000 + 59_000), now)).toBe(true);
  });

  it('refuses a delete exactly 10:00 ago', () => {
    expect(isUndoable(ago(10 * 60_000), now)).toBe(false);
  });

  it('accepts a delete stamped 1 s in the future (clock skew)', () => {
    expect(isUndoable(ago(-1000), now)).toBe(true);
  });

  it('honours a custom window', () => {
    expect(isUndoable(ago(500), now, 1000)).toBe(true);
    expect(isUndoable(ago(1000), now, 1000)).toBe(false);
  });
});
