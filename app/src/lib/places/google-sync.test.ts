import { describe, expect, it, vi } from 'vitest';
import {
  FORM_BASE_MAX,
  apiPlaceView,
  formBaseJson,
  googleSyncOnAdd,
  googleSyncOnUpdate,
  mergeGoogleRefresh,
  omitUnits,
  parseFormBase,
  parseGooglePick,
  statusBadgeLabel,
  untouchedUnits,
  visibleVolatile,
  type FormBase,
  type GooglePick,
  type GoogleSnapshot,
  type MergeRow,
  type StoredSync,
} from './google-sync';
import type { GoogleRefresh } from './google';

const now = new Date('2026-10-23T00:00:00Z');
const D = 86_400_000;
const ago = (ms: number) => new Date(now.getTime() - ms);

const vrow = {
  rating: 4.4,
  reviews: 1234,
  hours: 'H',
  ratingSyncedAt: ago(1 * D) as Date | null,
  hoursSyncedAt: ago(1 * D) as Date | null,
};

describe('visibleVolatile', () => {
  it('keeps a 29-day-old rating', () => {
    expect(visibleVolatile({ ...vrow, ratingSyncedAt: ago(29 * D) }, now)).toMatchObject({ rating: 4.4, reviews: 1234 });
  });
  it('drops an expired rating group, keeps fresh hours', () => {
    const v = visibleVolatile({ ...vrow, ratingSyncedAt: ago(30 * D + 1) }, now);
    expect(v).toMatchObject({ rating: null, reviews: null, hours: 'H' });
  });
  it('keeps a rating exactly 30 days old', () => {
    expect(visibleVolatile({ ...vrow, ratingSyncedAt: ago(30 * D) }, now)).toMatchObject({ rating: 4.4, reviews: 1234 });
  });
  it('drops expired hours, rating untouched', () => {
    const v = visibleVolatile({ ...vrow, hoursSyncedAt: ago(31 * D) }, now);
    expect(v).toMatchObject({ hours: null, rating: 4.4, reviews: 1234 });
  });
  it('never expires user-owned values', () => {
    const later = new Date(now.getTime() + 3650 * D);
    expect(visibleVolatile({ ...vrow, rating: 4, ratingSyncedAt: null }, later)).toMatchObject({ rating: 4 });
  });
  it('passes extra props through without mutating the input', () => {
    const input = { ...vrow, id: 'p1', googleSnapshot: { name: 'x' }, ratingSyncedAt: ago(31 * D) };
    const copy = structuredClone(input);
    const v = visibleVolatile(input, now);
    expect(v.id).toBe('p1');
    expect(v.googleSnapshot).toEqual({ name: 'x' });
    expect(v).not.toBe(input);
    expect(input).toEqual(copy);
  });
});

const fullSnap: GoogleSnapshot = { name: 'Jay Fai', address: 'X', lat: 13.7524, lng: 100.5045, phone: '02', website: 'https://a' };
const full: GooglePick = { fields: 'full', snapshot: fullSnap };
const basicPick: GooglePick = { fields: 'basic', snapshot: { name: 'Jay Fai', address: 'New Rd', lat: 13.8, lng: 100.6 } };

describe('parseGooglePick', () => {
  it('round-trips a valid pick', () => {
    expect(parseGooglePick(JSON.stringify(full))).toEqual(full);
  });
  it('round-trips a basic pick without phone/website keys', () => {
    const p = parseGooglePick(JSON.stringify(basicPick));
    expect(p).toEqual(basicPick);
    expect(p?.snapshot).not.toHaveProperty('phone');
  });
  const bad = (patch: Record<string, unknown>) =>
    JSON.stringify({ fields: 'full', ...patch, snapshot: { ...fullSnap, ...((patch.snapshot as object) ?? {}) } });
  it.each([
    ['null', null],
    ['empty', ''],
    ['broken json', '{'],
    ['too long', JSON.stringify({ ...full, pad: 'x'.repeat(4000) })],
    ['bad fields', bad({ fields: 'x' })],
    ['missing snapshot', JSON.stringify({ fields: 'full' })],
    ['string lat', bad({ snapshot: { lat: '13' } })],
    ['infinite lng', '{"fields":"full","snapshot":{"name":"a","address":null,"lat":1,"lng":1e999}}'],
    ['numeric name', bad({ snapshot: { name: 5 } })],
  ])('%s → null', (_, raw) => {
    expect(parseGooglePick(raw)).toBeNull();
  });
  it('drops unknown snapshot keys', () => {
    const p = parseGooglePick(JSON.stringify({ fields: 'full', snapshot: { ...fullSnap, rating: 4.4 } }));
    expect(p?.snapshot).not.toHaveProperty('rating');
    expect(p).toEqual(full);
  });
});

describe('googleSyncOnAdd', () => {
  const F = { rating: 4.4, reviews: 1234, hours: 'Mon: 9–5', placeIdExternal: 'ChIJa' };
  const allNull = { ratingSyncedAt: null, hoursSyncedAt: null, googleSyncedAt: null, googleSnapshot: null, googleStatus: null };
  it('no pick → all null', () => {
    expect(googleSyncOnAdd(F, null, now)).toEqual(allNull);
  });
  it('non-Google id → all null', () => {
    expect(googleSyncOnAdd({ ...F, placeIdExternal: 'geoapify:x' }, full, now)).toEqual(allNull);
  });
  it('full pick marks both groups and the sync time', () => {
    expect(googleSyncOnAdd(F, full, now)).toEqual({
      ratingSyncedAt: now, hoursSyncedAt: now, googleSyncedAt: now, googleSnapshot: full.snapshot, googleStatus: null,
    });
  });
  it('empty groups are not marked', () => {
    expect(googleSyncOnAdd({ ...F, rating: null, reviews: null, hours: null }, full, now)).toMatchObject({
      ratingSyncedAt: null, hoursSyncedAt: null, googleSnapshot: full.snapshot,
    });
  });
  it('only the non-empty group is marked', () => {
    expect(googleSyncOnAdd({ ...F, hours: null }, full, now)).toMatchObject({ ratingSyncedAt: now, hoursSyncedAt: null });
  });
  it('basic pick never marks rating/hours and queues a resync', () => {
    expect(googleSyncOnAdd(F, basicPick, now)).toEqual({
      ratingSyncedAt: null, hoursSyncedAt: null, googleSyncedAt: null, googleSnapshot: basicPick.snapshot, googleStatus: null,
    });
  });
});

const SNAP: GoogleSnapshot = { name: 'Jay Fai', address: 'Old Rd', lat: 13.75, lng: 100.5, phone: '02' };
const S: StoredSync = {
  rating: 4.4, reviews: 1234, hours: 'H',
  ratingSyncedAt: ago(1 * D), hoursSyncedAt: ago(1 * D),
  placeIdExternal: 'ChIJa', googleSnapshot: SNAP, googleSyncedAt: ago(1 * D), googleStatus: 'OPERATIONAL',
};
const f0 = { rating: 4.4, reviews: 1234, hours: 'H', placeIdExternal: 'ChIJa' as string | null, phone: null as string | null, website: null as string | null };
const B: FormBase = {
  name: 'Jay Fai', address: 'Old Rd', phone: '02', website: null, lat: 13.75, lng: 100.5,
  placeIdExternal: 'ChIJa', rating: 4.4, reviews: 1234, hours: 'H',
};

describe('googleSyncOnUpdate (no base)', () => {
  it('same values, no pick → {}', () => {
    expect(googleSyncOnUpdate(S, f0, null, now)).toEqual({});
  });
  it('edited rating → user-owned', () => {
    expect(googleSyncOnUpdate(S, { ...f0, rating: 4.0 }, null, now)).toEqual({ ratingSyncedAt: null });
  });
  it('edited reviews only → rating group user-owned', () => {
    expect(googleSyncOnUpdate(S, { ...f0, reviews: 1235 }, null, now)).toEqual({ ratingSyncedAt: null });
  });
  it('edited hours only → hours user-owned, rating stays Google', () => {
    expect(googleSyncOnUpdate(S, { ...f0, hours: 'H2' }, null, now)).toEqual({ hoursSyncedAt: null });
  });
  const expired = { ...S, ratingSyncedAt: ago(31 * D) };
  it('expired rating submitted blank → syncedAt null', () => {
    expect(googleSyncOnUpdate(expired, { ...f0, rating: null, reviews: null }, null, now)).toEqual({ ratingSyncedAt: null });
  });
  it('expired rating, user typed a value → user-owned', () => {
    expect(googleSyncOnUpdate(expired, { ...f0, rating: 4 }, null, now)).toEqual({ ratingSyncedAt: null });
  });
  it('different Google place picked → old Google groups cleared, queued', () => {
    expect(googleSyncOnUpdate(S, { ...f0, placeIdExternal: 'ChIJb' }, basicPick, now)).toEqual({
      rating: null, reviews: null, ratingSyncedAt: null, hours: null, hoursSyncedAt: null,
      googleSnapshot: basicPick.snapshot, googleSyncedAt: null, googleStatus: null,
    });
  });
  it('id changed to a non-Google id without a pick → no clearing', () => {
    expect(googleSyncOnUpdate(S, { ...f0, placeIdExternal: 'geoapify:x' }, null, now)).toEqual({
      googleSnapshot: null, googleSyncedAt: null, googleStatus: null,
    });
  });
  it('id cleared without a pick → same', () => {
    expect(googleSyncOnUpdate(S, { ...f0, placeIdExternal: null }, null, now)).toEqual({
      googleSnapshot: null, googleSyncedAt: null, googleStatus: null,
    });
  });
  it('re-picked the same place (basic) → snapshot merged, queued', () => {
    expect(googleSyncOnUpdate(S, f0, basicPick, now)).toEqual({
      googleSnapshot: { ...SNAP, ...basicPick.snapshot }, googleSyncedAt: null,
    });
  });
  it('re-picked the same place (full) → synced now', () => {
    expect(googleSyncOnUpdate(S, f0, full, now)).toEqual({
      googleSnapshot: { ...SNAP, ...full.snapshot }, googleSyncedAt: now,
    });
  });
});

describe('googleSyncOnUpdate (with base)', () => {
  it('stale form: DB changed after load, nothing edited → {}', () => {
    const stored = { ...S, rating: 4.5, reviews: 1300, placeIdExternal: 'ChIJnew' };
    expect(googleSyncOnUpdate(stored, B, null, now, B)).toEqual({});
  });
  it('edited rating → user-owned', () => {
    expect(googleSyncOnUpdate(S, { ...B, rating: 4.0 }, null, now, B)).toEqual({ ratingSyncedAt: null });
  });
  it('expired rating shown blank and left blank → untouched', () => {
    const stored = { ...S, ratingSyncedAt: ago(31 * D) };
    const base = { ...B, rating: null, reviews: null };
    expect(googleSyncOnUpdate(stored, base, null, now, base)).toEqual({});
  });
  it('re-pick a different place, everything else untouched → old data cleared', () => {
    const f = { ...B, name: 'Other', address: 'New Rd', lat: 13.8, lng: 100.6, placeIdExternal: 'ChIJb' };
    expect(googleSyncOnUpdate(S, f, basicPick, now, B)).toEqual({
      rating: null, reviews: null, ratingSyncedAt: null, hours: null, hoursSyncedAt: null, phone: null,
      googleSnapshot: basicPick.snapshot, googleSyncedAt: null, googleStatus: null,
    });
  });
  it('re-pick a different place keeps user data', () => {
    const stored = { ...S, ratingSyncedAt: null };
    const base = { ...B, phone: '01' };
    const f = { ...base, placeIdExternal: 'ChIJb', lat: 13.8, hours: 'H2', website: 'https://mine' };
    expect(googleSyncOnUpdate(stored, f, basicPick, now, base)).toEqual({
      hoursSyncedAt: null, googleSnapshot: basicPick.snapshot, googleSyncedAt: null, googleStatus: null,
    });
  });
  it('re-pick the same place → snapshot merged only', () => {
    expect(googleSyncOnUpdate(S, B, basicPick, now, B)).toEqual({
      googleSnapshot: { ...SNAP, ...basicPick.snapshot }, googleSyncedAt: null,
    });
  });
});

describe('parseFormBase / formBaseJson', () => {
  it('round-trips', () => {
    expect(parseFormBase(formBaseJson(B))).toEqual(B);
  });
  it('round-trips long hours under the cap', () => {
    const b = { ...B, hours: 'x'.repeat(10_000) };
    expect(parseFormBase(formBaseJson(b))).toEqual(b);
  });
  it.each([
    ['null', null],
    ['empty', ''],
    ['broken', '{'],
    ['string rating', JSON.stringify({ ...B, rating: '4' })],
    ['string lat', JSON.stringify({ ...B, lat: '13' })],
    ['numeric name', JSON.stringify({ ...B, name: 5 })],
  ])('%s → null, no warning', (_, raw) => {
    const warn = vi.fn();
    expect(parseFormBase(raw, warn)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
  it('drops unknown keys', () => {
    expect(parseFormBase(JSON.stringify({ ...B, kind: 'food', extra: 1 }))).toEqual(B);
  });
  it('normalizes like the browser + readPlaceFields', () => {
    const parsed = parseFormBase(formBaseJson({ ...B, name: '  Jay Fai ', website: '', hours: 'Mon: 9–5\r\nTue: 9–5\n' }));
    expect(parsed).toEqual({ ...B, website: null, hours: 'Mon: 9–5Tue: 9–5' });
    expect(untouchedUnits({ ...B, hours: 'Mon: 9–5Tue: 9–5' }, parsed).has('hours')).toBe(true);
  });
  it('oversized → null and one warning', () => {
    const warn = vi.fn();
    expect(parseFormBase('x'.repeat(FORM_BASE_MAX + 1), warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('untouchedUnits / omitUnits', () => {
  const ALL = ['name', 'address', 'phone', 'website', 'location', 'rating', 'hours'];
  it('identical → all units; no base → none', () => {
    expect([...untouchedUnits(B, B)].sort()).toEqual([...ALL].sort());
    expect(untouchedUnits(B, null).size).toBe(0);
  });
  it('edited name', () => {
    expect([...untouchedUnits({ ...B, name: 'Mine' }, B)].sort()).toEqual(ALL.filter((u) => u !== 'name').sort());
  });
  it('location moves together', () => {
    expect(untouchedUnits({ ...B, lat: 13.7 }, B).has('location')).toBe(false);
  });
  it('rating group moves together', () => {
    expect(untouchedUnits({ ...B, reviews: 1 }, B).has('rating')).toBe(false);
  });
  it('omitUnits keeps non-unit keys and does not mutate', () => {
    const f = { ...B, kind: 'food', name: 'Mine' };
    const copy = structuredClone(f);
    expect(omitUnits(f, untouchedUnits({ ...B, name: 'Mine' }, B))).toEqual({ kind: 'food', name: 'Mine' });
    expect(omitUnits(f, new Set())).toEqual(f);
    expect(f).toEqual(copy);
  });
});

describe('apiPlaceView', () => {
  const row = {
    id: 'p1', ...vrow, googleSyncedAt: now, googleSnapshot: SNAP, googleStatus: 'OPERATIONAL' as const,
  };
  it('strips internal sync columns, keeps status and rating', () => {
    const v = apiPlaceView(row, now);
    for (const k of ['googleSnapshot', 'ratingSyncedAt', 'hoursSyncedAt', 'googleSyncedAt']) {
      expect(v).not.toHaveProperty(k);
    }
    expect(v).toMatchObject({ googleStatus: 'OPERATIONAL', rating: 4.4 });
  });
  it('hides an expired rating', () => {
    expect(apiPlaceView({ ...row, ratingSyncedAt: ago(31 * D) }, now)).toMatchObject({ rating: null });
  });
});

describe('mergeGoogleRefresh', () => {
  const R: MergeRow = {
    name: 'Jay Fai',
    address: 'Old Rd',
    lat: 13.7524,
    lng: 100.5045,
    phone: '02-1',
    website: 'https://a',
    hours: 'H1',
    rating: 4.4,
    reviews: 1234,
    ratingSyncedAt: ago(20 * D),
    hoursSyncedAt: ago(20 * D),
    placeIdExternal: 'ChIJa',
    googleSnapshot: { name: 'Jay Fai', address: 'Old Rd', lat: 13.7524, lng: 100.5045, phone: '02-1', website: 'https://a' },
    googleSyncedAt: ago(26 * D),
    googleStatus: 'OPERATIONAL',
  };
  const G: GoogleRefresh = {
    id: 'ChIJa',
    name: 'Jay Fai 2',
    address: 'New Rd',
    lat: 13.7525,
    lng: 100.5046,
    phone: '02-2',
    website: 'https://b',
    hours: 'H2',
    rating: 4.5,
    reviews: 1300,
    businessStatus: 'CLOSED_TEMPORARILY',
  };
  const G_SNAP: GoogleSnapshot = {
    name: 'Jay Fai 2',
    address: 'New Rd',
    lat: 13.7525,
    lng: 100.5046,
    phone: '02-2',
    website: 'https://b',
  };
  const FULL = {
    name: 'Jay Fai 2',
    address: 'New Rd',
    lat: 13.7525,
    lng: 100.5046,
    phone: '02-2',
    website: 'https://b',
    hours: 'H2',
    rating: 4.5,
    reviews: 1300,
    ratingSyncedAt: now,
    hoursSyncedAt: now,
    googleStatus: 'CLOSED_TEMPORARILY',
    googleSyncedAt: now,
    googleSnapshot: G_SNAP,
  };
  const merge = (row: Partial<MergeRow>, g: Partial<GoogleRefresh> = {}) =>
    mergeGoogleRefresh({ ...R, ...row }, { ...G, ...g }, now);
  const without = (keys: string[]) => Object.fromEntries(Object.entries(FULL).filter(([k]) => !keys.includes(k)));

  it('1: unedited row follows Google in every field', () => {
    const p = merge({});
    expect(p).toEqual(FULL);
    expect(p).not.toHaveProperty('placeIdExternal');
  });

  it('2: an edited name is kept, snapshot still learns Google', () => {
    const p = merge({ name: 'My fave' });
    expect(p).not.toHaveProperty('name');
    expect(p.googleSnapshot?.name).toBe('Jay Fai 2');
    expect(p).toEqual(without(['name']));
  });

  it('3: an edited address is kept', () => {
    const p = merge({ address: 'My Rd' });
    expect(p).not.toHaveProperty('address');
    expect(p.name).toBe('Jay Fai 2');
  });

  it('4: no snapshot fills empties only', () => {
    const p = merge({ googleSnapshot: null, address: null, website: '' });
    expect(p.address).toBe('New Rd');
    expect(p.website).toBe('https://b');
    for (const k of ['name', 'phone', 'lat', 'lng']) expect(p).not.toHaveProperty(k);
    expect(p.googleSnapshot).toEqual(G_SNAP);
  });

  it('5: a snapshot key that is missing behaves like no snapshot for that field', () => {
    const p = merge({
      googleSnapshot: { name: 'Jay Fai', address: 'Old Rd', lat: 13.7524, lng: 100.5045 },
      phone: null,
      website: 'mine',
    });
    expect(p.phone).toBe('02-2');
    expect(p).not.toHaveProperty('website');
  });

  it('6: lat within 1e-7 of the snapshot counts as unedited', () => {
    const p = merge({ lat: 13.7524 + 5e-8 });
    expect(p.lat).toBe(13.7525);
    expect(p.lng).toBe(100.5046);
  });

  it('7: a dragged pin (lat) keeps both lat and lng', () => {
    const p = merge({ lat: 13.7524 + 2e-7 });
    expect(p).not.toHaveProperty('lat');
    expect(p).not.toHaveProperty('lng');
  });

  it('8: a dragged pin (lng only) keeps both lat and lng', () => {
    const p = merge({ lng: 100.5045 + 2e-7 });
    expect(p).not.toHaveProperty('lat');
    expect(p).not.toHaveProperty('lng');
  });

  it('9: no snapshot and no location fills the location', () => {
    const p = merge({ googleSnapshot: null, lat: null, lng: null });
    expect(p.lat).toBe(13.7525);
    expect(p.lng).toBe(100.5046);
  });

  it("10: a user's rating is never touched; hours still written", () => {
    const p = merge({ rating: 3, reviews: null, ratingSyncedAt: null });
    for (const k of ['rating', 'reviews', 'ratingSyncedAt']) expect(p).not.toHaveProperty(k);
    expect(p.hours).toBe('H2');
  });

  it('11: an expired (not yet purged) Google rating is refreshed', () => {
    const p = merge({ ratingSyncedAt: ago(40 * D) });
    expect(p).toMatchObject({ rating: 4.5, reviews: 1300, ratingSyncedAt: now });
  });

  it('12: an empty rating group is filled', () => {
    const p = merge({ rating: null, reviews: null, ratingSyncedAt: null });
    expect(p).toMatchObject({ rating: 4.5, reviews: 1300, ratingSyncedAt: now });
  });

  it('13: Google sends no rating → values and syncedAt null', () => {
    const p = merge({}, { rating: null, reviews: null });
    expect(p).toHaveProperty('rating', null);
    expect(p).toHaveProperty('reviews', null);
    expect(p).toHaveProperty('ratingSyncedAt', null);
  });

  it("14: a user's hours are never touched; rating still written", () => {
    const p = merge({ hours: 'My hours', hoursSyncedAt: null });
    expect(p).not.toHaveProperty('hours');
    expect(p).not.toHaveProperty('hoursSyncedAt');
    expect(p).toMatchObject({ rating: 4.5, reviews: 1300, ratingSyncedAt: now });
  });

  it('15: NOT_FOUND writes only the status', () => {
    expect(mergeGoogleRefresh(R, 'NOT_FOUND', now)).toEqual({ googleStatus: 'NOT_FOUND' });
  });

  it('15b: INVALID writes the status and googleSyncedAt', () => {
    expect(mergeGoogleRefresh(R, 'INVALID', now)).toEqual({ googleStatus: 'INVALID', googleSyncedAt: now });
  });

  it('16: an empty Google name is skipped and the snapshot keeps the previous name', () => {
    const p = merge({}, { name: '' });
    expect(p).not.toHaveProperty('name');
    expect(p.googleSnapshot?.name).toBe('Jay Fai');
  });

  it('17: a null businessStatus writes a null status', () => {
    expect(merge({}, { businessStatus: null })).toHaveProperty('googleStatus', null);
  });

  it('18: a new valid Google id is written', () => {
    expect(merge({}, { id: 'ChIJnew' }).placeIdExternal).toBe('ChIJnew');
  });

  it('19: an invalid Google id is not written', () => {
    expect(merge({}, { id: 'a/b' })).not.toHaveProperty('placeIdExternal');
  });

  it('20: a null Google address follows when the row matched the snapshot', () => {
    expect(merge({}, { address: null })).toHaveProperty('address', null);
  });

  it('does not mutate the row', () => {
    const copy = structuredClone(R);
    mergeGoogleRefresh(R, G, now);
    expect(R).toEqual(copy);
  });

  it('is idempotent apart from the *SyncedAt timestamps', () => {
    const R1 = { ...R, ...mergeGoogleRefresh(R, G, now) };
    const later = new Date(now.getTime() + D);
    const R2 = { ...R1, ...mergeGoogleRefresh(R1, G, later) };
    const strip = (r: MergeRow) => ({ ...r, ratingSyncedAt: null, hoursSyncedAt: null, googleSyncedAt: null });
    expect(strip(R2)).toEqual(strip(R1));
  });
});

describe('statusBadgeLabel', () => {
  it('labels only the closed states', () => {
    expect(statusBadgeLabel('CLOSED_PERMANENTLY')).toBe('Closed permanently');
    expect(statusBadgeLabel('CLOSED_TEMPORARILY')).toBe('Temporarily closed');
    for (const s of ['OPERATIONAL', 'NOT_FOUND', 'INVALID', null, undefined] as const) {
      expect(statusBadgeLabel(s)).toBeNull();
    }
  });
});
