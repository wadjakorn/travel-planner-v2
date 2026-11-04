import { describe, expect, it } from 'vitest';
import { readHotelFormFields } from './hotel-form-fields';

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('readHotelFormFields', () => {
  it('round-trips status, area and coordsApprox through the form fields', () => {
    // Review Focus 3: an approximate tbd hotel edited without a re-pick.
    const r = readHotelFormFields(
      fd({ name: 'Dogo', status: 'tbd', area: 'Dogo Onsen', lat: '33.85', lng: '132.79', coordsApprox: 'true' }),
    );
    expect(r.fields).toMatchObject({ name: 'Dogo', status: 'tbd', area: 'Dogo Onsen', lat: 33.85, lng: 132.79 });
    expect(r.server).toEqual({ coordsApprox: true });
  });

  it('unknown status posts as confirmed; coordsApprox other than "true" is false', () => {
    const r = readHotelFormFields(fd({ name: 'H', status: 'bogus', coordsApprox: '' }));
    expect(r.fields.status).toBe('confirmed');
    expect(r.server).toEqual({ coordsApprox: false });
  });

  it('blank area posts as null (cleared)', () => {
    const r = readHotelFormFields(fd({ name: 'H', area: '  ' }));
    expect(r.fields.area).toBeNull();
  });

  it('leaves status, area and coordsApprox untouched when the form omits them', () => {
    // A form without the new inputs must never reset a tbd hotel to confirmed
    // or wipe its approximate-pin flag (update is a partial patch; on create
    // the DB defaults confirmed / false apply).
    const r = readHotelFormFields(fd({ name: 'H' }));
    expect(r.fields).not.toHaveProperty('status');
    expect(r.fields).not.toHaveProperty('area');
    expect(r.server).toEqual({});
  });

  it('keeps every field the old reader produced', () => {
    const r = readHotelFormFields(
      fd({
        dayIdx: '2', name: ' Inn ', address: 'A', lat: '1.5', lng: '2.5', placeIdExternal: 'p1',
        checkInDate: '2026-11-04', checkInTime: '15:00', checkOutDate: '2026-11-06', checkOutTime: '10:00',
        nights: '2', room: 'Twin', guests: '3', ref: 'R1', costAmount: '120.5', costCurrency: 'JPY',
        cancellation: 'free', contact: 'c', notes: 'n', attachmentName: 'f.pdf', attachmentSize: '1 KB', thumb: 't',
      }),
    );
    expect(r.fields).toEqual({
      dayIdx: 2, name: 'Inn', address: 'A', lat: 1.5, lng: 2.5, placeIdExternal: 'p1',
      checkInDate: '2026-11-04', checkInTime: '15:00', checkOutDate: '2026-11-06', checkOutTime: '10:00',
      nights: 2, room: 'Twin', guests: 3, ref: 'R1', costAmount: 120.5, costCurrency: 'JPY',
      cancellation: 'free', contact: 'c', notes: 'n', attachmentName: 'f.pdf', attachmentSize: '1 KB', thumb: 't',
    });
  });

  it('missing name posts as empty string like before', () => {
    expect(readHotelFormFields(fd({})).fields.name).toBe('');
  });
});
