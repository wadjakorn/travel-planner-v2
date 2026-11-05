import { describe, expect, it } from 'vitest';
import type { LegEnd, LegInfo } from './leg-info';
import { legSheetFields, parseDurationField } from './leg-sheet-fields';

const end = (name: string, lat: number | null, lng: number | null): LegEnd => ({
  name,
  lat,
  lng,
  address: lat == null ? null : `${name} street`,
  placeIdExternal: null,
});

const segInfo: LegInfo = {
  key: 'd1:a>b',
  kind: 'segment',
  dayId: 'd1',
  dayNum: 1,
  fromId: 'a',
  toId: 'b',
  fromNum: 1,
  toNum: 2,
  from: end('A', 13.7, 100.5),
  to: end('B', 13.8, 100.6),
  mode: 'transit',
  note: 'Platform 9',
  durationMin: 40,
  slot: 0,
  placeId: 'b',
  after: 'a',
  hotelId: null,
  hotelLeg: null,
};

const hotelInfo: LegInfo = {
  ...segInfo,
  key: 'd1:b>hotel-h1-end',
  kind: 'hotel',
  fromId: 'b',
  toId: 'hotel-h1-end',
  mode: 'drive',
  note: null,
  durationMin: null,
  placeId: null,
  after: null,
  hotelId: 'h1',
  hotelLeg: 'arrival',
};

describe('legSheetFields', () => {
  it('read-only shows no editable fields', () => {
    expect(legSheetFields(segInfo, true).editable).toBe(false);
    expect(legSheetFields(segInfo, true).showHotelHint).toBe(false);
  });

  it('segment legs edit mode, time and note', () => {
    expect(legSheetFields(segInfo, false)).toEqual({
      editable: true,
      showDuration: true,
      showNote: true,
      showHotelHint: false,
      showNavigate: true,
    });
  });

  it('hotel legs edit mode only, with the every-night hint', () => {
    expect(legSheetFields(hotelInfo, false)).toEqual({
      editable: true,
      showDuration: false,
      showNote: false,
      showHotelHint: true,
      showNavigate: true,
    });
    expect(legSheetFields(hotelInfo, true).showHotelHint).toBe(false);
  });

  it('no navigate when an end has no location', () => {
    const info: LegInfo = { ...segInfo, from: { name: 'A', lat: null, lng: null, address: null, placeIdExternal: null } };
    expect(legSheetFields(info, false).showNavigate).toBe(false);
    expect(legSheetFields(info, true).showNavigate).toBe(false);
  });
});

describe('parseDurationField', () => {
  it('parseDurationField', () => {
    expect(parseDurationField('')).toEqual({ ok: true, value: null });
    expect(parseDurationField('  ')).toEqual({ ok: true, value: null });
    expect(parseDurationField('40')).toEqual({ ok: true, value: 40 });
    expect(parseDurationField('0')).toEqual({ ok: true, value: 0 });
    expect(parseDurationField('2880')).toEqual({ ok: true, value: 2880 });
    for (const bad of ['2881', '-1', '1.5', 'abc', '1e2']) {
      expect(parseDurationField(bad)).toEqual({ ok: false });
    }
  });
});
