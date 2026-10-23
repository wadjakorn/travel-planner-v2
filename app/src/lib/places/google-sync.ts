// Expiring Google data (TP-0047, resync design §2–§3).
//
// rating+reviews and hours are two independent "volatile" groups. A non-null
// `*SyncedAt` means "came from Google at that time" and expires after
// VOLATILE_TTL_MS; null means user-owned (or empty) and never expires.
// `googleSnapshot` holds the permanent Google values (never rating/reviews/
// hours) so a later resync can tell user edits from Google data.
//
// Pure: no db / server-only imports (type-only imports are fine).

import type { PlaceFields } from '@/lib/services/place-service';
import { isGooglePlaceId } from './place-id';
import type { Fields } from './types';

export const VOLATILE_TTL_MS = 30 * 86_400_000;
export const VOLATILE_GROUPS = { rating: ['rating', 'reviews'], hours: ['hours'] } as const;

export type GoogleStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY' | 'NOT_FOUND' | 'INVALID';
export type GoogleSnapshot = {
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  phone?: string | null;
  website?: string | null;
};
export type GooglePick = { fields: Fields; snapshot: GoogleSnapshot };
export type SyncColumns = {
  ratingSyncedAt: Date | null;
  hoursSyncedAt: Date | null;
  googleSyncedAt: Date | null;
  googleSnapshot: GoogleSnapshot | null;
  googleStatus: GoogleStatus | null;
};
export type VolatileRow = {
  rating: number | null;
  reviews: number | null;
  hours: string | null;
  ratingSyncedAt: Date | null;
  hoursSyncedAt: Date | null;
};
export type StoredSync = VolatileRow &
  Pick<SyncColumns, 'googleSnapshot' | 'googleSyncedAt' | 'googleStatus'> & { placeIdExternal: string | null };

type Group = keyof typeof VOLATILE_GROUPS;
const SYNC_COL = { rating: 'ratingSyncedAt', hours: 'hoursSyncedAt' } as const;
const GROUPS = Object.keys(VOLATILE_GROUPS) as Group[];

function expired(syncedAt: Date | null, now: Date): boolean {
  return syncedAt != null && syncedAt.getTime() < now.getTime() - VOLATILE_TTL_MS;
}

// New object; values of an expired group read as null.
export function visibleVolatile<T extends VolatileRow>(row: T, now: Date): T {
  const out = { ...row };
  for (const g of GROUPS) {
    if (!expired(row[SYNC_COL[g]], now)) continue;
    for (const k of VOLATILE_GROUPS[g]) (out as VolatileRow)[k] = null;
  }
  return out;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === 'string';
const isNumOrNull = (v: unknown): v is number | null => v === null || isNum(v);

const PICK_MAX = 4000;

function parseSnapshot(v: unknown): GoogleSnapshot | null {
  if (!isObj(v)) return null;
  if (typeof v.name !== 'string' || !isStrOrNull(v.address) || !isNum(v.lat) || !isNum(v.lng)) return null;
  const snap: GoogleSnapshot = { name: v.name, address: v.address, lat: v.lat, lng: v.lng };
  for (const k of ['phone', 'website'] as const) {
    if (!(k in v)) continue;
    if (!isStrOrNull(v[k])) return null;
    snap[k] = v[k];
  }
  return snap;
}

// The hidden `googlePick` form field (client-supplied; see design "Trust").
export function parseGooglePick(raw: unknown): GooglePick | null {
  if (typeof raw !== 'string' || raw === '' || raw.length > PICK_MAX) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || (v.fields !== 'basic' && v.fields !== 'full')) return null;
  const snapshot = parseSnapshot(v.snapshot);
  return snapshot ? { fields: v.fields, snapshot } : null;
}

const NO_SYNC: SyncColumns = {
  ratingSyncedAt: null,
  hoursSyncedAt: null,
  googleSyncedAt: null,
  googleSnapshot: null,
  googleStatus: null,
};

type VolatileValues = Pick<PlaceFields, 'rating' | 'reviews' | 'hours'>;

function groupEmpty(f: VolatileValues, g: Group): boolean {
  return VOLATILE_GROUPS[g].every((k) => f[k] == null);
}

function groupEqual(a: VolatileValues, b: VolatileValues, g: Group): boolean {
  return VOLATILE_GROUPS[g].every((k) => a[k] === b[k]);
}

export function googleSyncOnAdd(
  f: Pick<PlaceFields, 'rating' | 'reviews' | 'hours' | 'placeIdExternal'>,
  pick: GooglePick | null,
  now: Date,
): SyncColumns {
  if (!pick || !isGooglePlaceId(f.placeIdExternal)) return { ...NO_SYNC };
  // A basic pick never claims rating/hours (the user typed them) and leaves
  // googleSyncedAt null so the nightly resync fetches the full data first.
  const isFull = pick.fields === 'full';
  return {
    ratingSyncedAt: isFull && !groupEmpty(f, 'rating') ? now : null,
    hoursSyncedAt: isFull && !groupEmpty(f, 'hours') ? now : null,
    googleSyncedAt: isFull ? now : null,
    googleSnapshot: pick.snapshot,
    googleStatus: null,
  };
}

export type FormBase = Pick<
  PlaceFields,
  'name' | 'address' | 'phone' | 'website' | 'lat' | 'lng' | 'placeIdExternal' | 'rating' | 'reviews' | 'hours'
>;

// Value keys appear only when a re-pick clears the old place's Google data.
export type UpdatePatch = Partial<SyncColumns & Pick<PlaceFields, 'rating' | 'reviews' | 'hours' | 'phone' | 'website'>>;

export function googleSyncOnUpdate(
  stored: StoredSync,
  f: Pick<PlaceFields, 'rating' | 'reviews' | 'hours' | 'placeIdExternal' | 'phone' | 'website'>,
  pick: GooglePick | null,
  now: Date,
  base?: FormBase | null,
): UpdatePatch {
  const patch: UpdatePatch = {};
  // What the user saw: the rendered form when known, else the visible row.
  const ref: VolatileValues = base ?? visibleVolatile(stored, now);
  const untouched = (g: Group) => groupEqual(f, ref, g);

  for (const g of GROUPS) {
    if (!untouched(g) || (!base && groupEmpty(f, g))) patch[SYNC_COL[g]] = null;
  }

  const refId = base ? base.placeIdExternal : stored.placeIdExternal;
  if (f.placeIdExternal !== refId) {
    patch.googleSnapshot = pick?.snapshot ?? null;
    patch.googleSyncedAt = pick?.fields === 'full' ? now : null;
    patch.googleStatus = null;
    if (pick) {
      // A different place was picked: the old place's Google data must not
      // ride along under the new snapshot. User-owned / edited data stays.
      for (const g of GROUPS) {
        const col = SYNC_COL[g];
        if (stored[col] == null || !untouched(g)) continue;
        for (const k of VOLATILE_GROUPS[g]) patch[k] = null;
        patch[col] = null;
      }
      const old = stored.googleSnapshot;
      for (const k of ['phone', 'website'] as const) {
        const keptFromForm = base ? f[k] === base[k] : true;
        if (keptFromForm && old && Object.hasOwn(old, k) && old[k] === f[k]) patch[k] = null;
      }
    }
  } else if (pick) {
    patch.googleSnapshot = { ...(stored.googleSnapshot ?? {}), ...pick.snapshot };
    patch.googleSyncedAt = pick.fields === 'full' ? now : null;
  }
  return patch;
}

// ---- formBase: the Google-tracked values the edit form rendered ----------

export const FORM_BASE_MAX = 16_000;

const TEXT_KEYS = ['name', 'address', 'phone', 'website', 'hours'] as const;
const NUM_KEYS = ['lat', 'lng', 'rating', 'reviews'] as const;

function trimOrNull(v: string | null): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

// A text <input> strips CR/LF from its value (removed, not replaced), then
// readPlaceFields trims and maps '' to null.
function textInputValue(v: string | null): string | null {
  return trimOrNull(v == null ? null : v.replace(/[\r\n]/g, ''));
}

function normalizeFormBase(row: FormBase): FormBase {
  return {
    // readPlaceFields reads name as `trimOrNull(...) ?? ''`.
    name: textInputValue(row.name) ?? '',
    address: textInputValue(row.address),
    phone: textInputValue(row.phone),
    website: textInputValue(row.website),
    hours: textInputValue(row.hours),
    lat: row.lat,
    lng: row.lng,
    placeIdExternal: trimOrNull(row.placeIdExternal),
    rating: row.rating,
    reviews: row.reviews,
  };
}

export function formBaseJson(row: FormBase): string {
  return JSON.stringify(normalizeFormBase(row));
}

export function parseFormBase(raw: unknown, warn: (msg: string) => void = console.warn): FormBase | null {
  if (typeof raw !== 'string' || raw === '') return null;
  if (raw.length > FORM_BASE_MAX) {
    warn(`formBase rejected: ${raw.length} chars > ${FORM_BASE_MAX}; saving without it`);
    return null;
  }
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || typeof v.name !== 'string' || !isStrOrNull(v.placeIdExternal)) return null;
  for (const k of TEXT_KEYS) if (!isStrOrNull(v[k])) return null;
  for (const k of NUM_KEYS) if (!isNumOrNull(v[k])) return null;
  return {
    name: v.name,
    address: v.address as string | null,
    phone: v.phone as string | null,
    website: v.website as string | null,
    hours: v.hours as string | null,
    lat: v.lat as number | null,
    lng: v.lng as number | null,
    placeIdExternal: v.placeIdExternal,
    rating: v.rating as number | null,
    reviews: v.reviews as number | null,
  };
}

export type Unit = 'name' | 'address' | 'phone' | 'website' | 'location' | 'rating' | 'hours';
export const UNIT_FIELDS = {
  name: ['name'],
  address: ['address'],
  phone: ['phone'],
  website: ['website'],
  location: ['lat', 'lng', 'placeIdExternal'],
  rating: ['rating', 'reviews'],
  hours: ['hours'],
} as const;
const UNITS = Object.keys(UNIT_FIELDS) as Unit[];

// A unit is untouched iff every one of its values equals base's. No base
// (API path) → empty set: everything is written.
export function untouchedUnits(submitted: FormBase, base: FormBase | null): Set<Unit> {
  const out = new Set<Unit>();
  if (!base) return out;
  for (const u of UNITS) {
    if (UNIT_FIELDS[u].every((k) => submitted[k] === base[k])) out.add(u);
  }
  return out;
}

export function omitUnits<F extends FormBase>(f: F, units: Set<Unit>): Partial<F> {
  const out: Partial<F> = { ...f };
  for (const u of units) for (const k of UNIT_FIELDS[u]) delete out[k];
  return out;
}

const API_HIDDEN = ['googleSnapshot', 'ratingSyncedAt', 'hoursSyncedAt', 'googleSyncedAt'] as const;

// The /api/v1 place view: expired values hidden, internal sync columns dropped.
export function apiPlaceView<T extends VolatileRow>(row: T, now: Date): Omit<T, (typeof API_HIDDEN)[number]> {
  const out: Record<string, unknown> = visibleVolatile(row, now);
  for (const k of API_HIDDEN) delete out[k];
  return out as Omit<T, (typeof API_HIDDEN)[number]>;
}
