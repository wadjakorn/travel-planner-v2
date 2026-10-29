import { afterEach, describe, expect, it, vi } from 'vitest';
import { DAY_SEARCH_EVENT, isTypingTarget, requestDaySearchFocus, takeDaySearchFocus } from './day-search-focus';

afterEach(() => {
  takeDaySearchFocus('d1');
  takeDaySearchFocus('d2');
  vi.unstubAllGlobals();
});

describe('day search focus handoff', () => {
  it('pending focus is taken once, by the matching day only', () => {
    requestDaySearchFocus('d2');
    expect(takeDaySearchFocus('d1')).toBe(false);
    expect(takeDaySearchFocus('d2')).toBe(true);
    expect(takeDaySearchFocus('d2')).toBe(false);
  });
  it('a newer request replaces an untaken one', () => {
    requestDaySearchFocus('d1');
    requestDaySearchFocus('d2');
    expect(takeDaySearchFocus('d1')).toBe(false);
    expect(takeDaySearchFocus('d2')).toBe(true);
  });
  it('dispatches the event on window with the day id', () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    requestDaySearchFocus('d1');
    const ev = dispatchEvent.mock.calls[0][0] as CustomEvent<{ dayId: string }>;
    expect(ev.type).toBe(DAY_SEARCH_EVENT);
    expect(ev.detail).toEqual({ dayId: 'd1' });
  });
  it('without window it only records the pending day', () => {
    requestDaySearchFocus('d1');
    expect(takeDaySearchFocus('d1')).toBe(true);
  });
});

describe('isTypingTarget', () => {
  const el = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable }) as unknown as EventTarget;
  it('inputs, textareas, selects and contenteditable swallow "/"', () => {
    for (const t of ['INPUT', 'TEXTAREA', 'SELECT']) expect(isTypingTarget(el(t))).toBe(true);
    expect(isTypingTarget(el('DIV', true))).toBe(true);
  });
  it('anything else does not', () => {
    expect(isTypingTarget(el('BODY'))).toBe(false);
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
