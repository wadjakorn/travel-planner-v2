import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/db', () => ({ db: {}, dbNode: {} }));

import { parseNoteImportInput, MAX_NOTE_ITEMS } from './note-service';
import { parseSections } from '@/lib/api/import-sections';

describe('parseNoteImportInput (TP-0145)', () => {
  it('parses checklist items (trimmed, done defaults to false)', () => {
    expect(
      parseNoteImportInput({ kind: 'checklist', title: 'Book', items: [{ text: ' Ferry ' }, { text: 'Hotel', done: true }] }),
    ).toEqual({
      kind: 'checklist',
      title: 'Book',
      body: null,
      items: [
        { text: 'Ferry', done: false },
        { text: 'Hotel', done: true },
      ],
    });
  });
  it('items absent / null / [] -> []', () => {
    expect(parseNoteImportInput({ kind: 'doc', title: 'D' }).items).toEqual([]);
    expect(parseNoteImportInput({ kind: 'doc', title: 'D', items: null }).items).toEqual([]);
    expect(parseNoteImportInput({ kind: 'doc', title: 'D', items: [] }).items).toEqual([]);
  });
  it('rejects items on a doc, a non-array, bad text / done, and > cap', () => {
    expect(() => parseNoteImportInput({ kind: 'doc', title: 'D', items: [{ text: 'x' }] })).toThrow(/only allowed on a checklist/);
    expect(() => parseNoteImportInput({ kind: 'checklist', title: 'C', items: 'x' })).toThrow(/must be an array/);
    expect(() => parseNoteImportInput({ kind: 'checklist', title: 'C', items: [{ text: ' ' }] })).toThrow(/"items\[0\]\.text" is required/);
    expect(() => parseNoteImportInput({ kind: 'checklist', title: 'C', items: ['x'] })).toThrow(/"items\[0\]\.text"/);
    expect(() => parseNoteImportInput({ kind: 'checklist', title: 'C', items: [{ text: 'a', done: 'yes' }] })).toThrow(/"items\[0\]\.done" must be a boolean/);
    const many = Array.from({ length: MAX_NOTE_ITEMS + 1 }, (_, i) => ({ text: `t${i}` }));
    expect(() => parseNoteImportInput({ kind: 'checklist', title: 'C', items: many })).toThrow(/limit of 200/);
  });
});

describe('import notes section (TP-0145)', () => {
  it('carries items and prefixes item errors with the note number', () => {
    expect(parseSections({ notes: [{ kind: 'checklist', title: 'C', items: [{ text: 'a' }] }] }).notes[0].items).toEqual([
      { text: 'a', done: false },
    ]);
    expect(() => parseSections({ notes: [{ kind: 'checklist', title: 'C', items: [{}] }] })).toThrow(
      /notes 1: "items\[0\]\.text" is required/,
    );
  });
});
