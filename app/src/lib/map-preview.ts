// Trip-map search preview (TP-0062): the data model shared by the search
// picker and the map, plus the pure rules (ownership, request ordering, camera
// focus, coords caching). React wiring lives in components/map-preview-context.tsx.

import { gmapsSearchUrl } from './gmaps';
import type { Translate } from './i18n-client';
import { FIT_MAX_ZOOM, type LatLng, type Pin } from './map-helpers';
import { stopName } from './map-pin';
import type { Kind, Located, PlacePhoto, PlaceSuggestion } from './places/types';
import { formatDistance, type Units } from './units';

export const PREVIEW_ZOOM = FIT_MAX_ZOOM;
// The preview pin sits this far below the map centre so its card (above it) fits.
export const PREVIEW_OFFSET_Y = 120;

// A Google photo ref (name + author attributions). Never stored; the card
// resolves it to an image URL at render time (components/use-photo-uri.ts).
export type MapPreviewPhoto = PlacePhoto;

export type MapPreviewData = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  kind: Kind;
  gmapsUrl: string;
  photo: MapPreviewPhoto | null;
};

export type MapPreview = MapPreviewData & {
  ownerId: string; // the publishing picker (useId)
  dayLabel: string; // "Day 3": where the popup's Add puts it
  onAdd: () => Promise<boolean>; // false when the add did not start
  onClose: () => void;
};

/** JSON route that resolves a photo name to its short-lived image URL. */
export function photoUriUrl(name: string): string {
  return `/api/places/photo?name=${encodeURIComponent(name)}`;
}

export function toMapPreviewData(l: Located): MapPreviewData {
  return {
    id: l.id,
    name: l.name,
    address: l.address || l.secondary || null,
    lat: l.lat,
    lng: l.lng,
    kind: l.kind,
    // Same args the preview modal uses.
    gmapsUrl: gmapsSearchUrl({ name: l.name, address: l.secondary, lat: l.lat, lng: l.lng, placeIdExternal: l.id }),
    photo: l.photo ?? null,
  };
}

export type PreviewState = { preview: MapPreview | null; latest: number };

export type PreviewAction =
  | { type: 'begin' }
  | { type: 'set'; preview: MapPreview; token: number }
  | { type: 'clear'; ownerId?: string };

// `latest` orders requests: a picker takes a token with `begin` before its
// async coords lookup, and its `set` lands only if nothing began or cleared
// since. So a slow result can neither resurrect an exited preview nor
// overwrite a newer one from another day's picker.
export function previewReducer(s: PreviewState, a: PreviewAction): PreviewState {
  switch (a.type) {
    case 'begin':
      return { ...s, latest: s.latest + 1 };
    case 'set':
      return a.token === s.latest ? { ...s, preview: a.preview } : s;
    case 'clear': {
      const mine = a.ownerId === undefined || s.preview?.ownerId === a.ownerId;
      return { preview: mine ? null : s.preview, latest: s.latest + 1 };
    }
  }
}

// A search preview frames the day with it only when a stop is this close;
// farther away (another city) both would be unreadable, so it frames alone.
export const PREVIEW_FRAME_MAX_M = 50_000;
// ownerId of a tapped map POI preview (TP-0077, components/use-poi-preview.ts).
export const POI_PREVIEW_OWNER = 'poi';

export type MapFocus =
  | { kind: 'preview'; lat: number; lng: number } // preview alone, card offset
  | { kind: 'preview-fit'; points: LatLng[] } // day pins ∪ preview (search result)
  | { kind: 'preview-reveal'; lat: number; lng: number } // tapped map POI: reveal with card clearance
  | { kind: 'active'; lat: number; lng: number } // reveal (no move / minimal pan)
  | { kind: 'fit' } // frame the day's pins
  | { kind: 'fallback'; points: LatLng[] } // empty day
  | { kind: 'stay' };

export type FocusInput = {
  /** fromMap: a tapped map POI (ownerId === POI_PREVIEW_OWNER), not a search result. */
  preview: (LatLng & { fromMap?: boolean }) | null;
  activePin: Pin | null;
  activeChanged: boolean;
  previewExited?: boolean;
  pinsChanged?: boolean;
  pins: readonly Pin[];
  fallback?: readonly LatLng[];
};

// A freshly selected place wins over a preview that is about to be cleared,
// so a pin click moves the camera once, not preview-then-pin. Any other exit
// (new search, Esc, ✕, add) leaves the camera where the user is looking.
// Closing the active pin's card likewise stays put, unless the pin set changed
// with it (a day switch also clears the active pin): then refit the new day.
// A tapped map POI is already on screen, so it is only revealed; a search
// result is framed with the day's stops when one is near.
export function mapFocus(i: FocusInput): MapFocus {
  const { preview, activePin, activeChanged, previewExited = false, pinsChanged = false, pins } = i;
  if (activeChanged && activePin) return { kind: 'active', lat: activePin.lat, lng: activePin.lng };
  if (activeChanged && !preview && !pinsChanged) return { kind: 'stay' };
  if (previewExited && !preview) return { kind: 'stay' };
  if (preview) {
    const at = { lat: preview.lat, lng: preview.lng };
    if (preview.fromMap) return { kind: 'preview-reveal', ...at };
    const near = nearestStop(pins, at);
    if (near && near.meters <= PREVIEW_FRAME_MAX_M) return { kind: 'preview-fit', points: [...pins, at] };
    return { kind: 'preview', ...at };
  }
  if (activePin) return { kind: 'active', lat: activePin.lat, lng: activePin.lng };
  if (pins.length) return { kind: 'fit' };
  if (i.fallback?.length) return { kind: 'fallback', points: [...i.fallback] };
  return { kind: 'stay' };
}

// Keyed async lookup for the page session: cached by key, concurrent calls
// share one request, a throw is retried next time. `cacheNull` also remembers
// "nothing there" (e.g. a place with no photo) so it is not asked again.
export type CachedLookup<T> = ((key: string) => Promise<T | null>) & {
  /** The settled value, synchronously; undefined when not (yet) cached. */
  peek: (key: string) => T | null | undefined;
};

export function createCachedLookup<T>(
  fetchOne: (key: string) => Promise<T | null>,
  o: { cacheNull?: boolean } = {},
): CachedLookup<T> {
  const done = new Map<string, T | null>();
  const inflight = new Map<string, Promise<T | null>>();
  const look = (key: string): Promise<T | null> => {
    if (done.has(key)) return Promise.resolve(done.get(key) ?? null);
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = fetchOne(key)
      .then((v) => {
        if (v != null || o.cacheNull) done.set(key, v);
        return v;
      })
      .catch(() => null)
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  };
  return Object.assign(look, { peek: (key: string) => (done.has(key) ? (done.get(key) ?? null) : undefined) });
}

// Per-picker coords lookup: cached by suggestion id, concurrent calls share one
// request, failures are retried next time.
export function createCoordsResolver(
  fetchCoords: (s: PlaceSuggestion) => Promise<Located | null>,
): (s: PlaceSuggestion) => Promise<Located | null> {
  const byId = new Map<string, PlaceSuggestion>();
  const look = createCachedLookup((id) => fetchCoords(byId.get(id)!));
  return (s) => {
    byId.set(s.id, s);
    return look(s.id);
  };
}

const EARTH_RADIUS_M = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle (haversine) distance in metres. */
export function metersBetween(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type NearStop = { stop: Pick<Pin, 'name' | 'idx'>; meters: number };

export function nearestStop(pins: readonly Pin[], at: LatLng): NearStop | null {
  let best: NearStop | null = null;
  for (const p of pins) {
    const meters = metersBetween(p, at);
    if (!best || meters < best.meters) best = { stop: p, meters };
  }
  return best;
}

function metricNear(meters: number): string {
  const m = Math.round(meters / 10) * 10;
  if (m < 1000) return `${m} m`;
  // Past 100 km the decimal is noise; whole km still flags "wrong city".
  if (meters >= 100_000) return `${Math.round(meters / 1000)} km`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** "≈ 350 m from Tsuta Ramen" in the user's units; null when there is no stop. */
export function formatNear(n: NearStop | null, units: Units, t: Translate): string | null {
  if (!n) return null;
  return t('place_search_near', { dist: formatDistance(metricNear(n.meters), units), stop: stopName(n.stop, t) });
}

/** "350 m" / "1.2 km" in the user's units; null when it would read 0 (Google: never show a zero distance). */
export function nearDistance(meters: number, units: Units): string | null {
  const metric = metricNear(meters);
  return metric === '0 m' ? null : formatDistance(metric, units);
}

/** The stop a day's Google distances are measured from: its last located stop (tonight's stay when there is one). */
export function dayAnchor(pins: readonly Pin[]): Pin | null {
  return pins.length ? pins[pins.length - 1] : null;
}

export type SuggestionNear = { dist: string; name: string };

// A search row's distance line. A row with coords measures to the nearest
// stop; a Google row (no coords) carries Autocomplete's distanceMeters from
// the day anchor (the request's `origin`). Null with no stop, no distance, or
// a distance that would read 0.
export function suggestionNear(
  s: PlaceSuggestion,
  pins: readonly Pin[],
  units: Units,
  t: Translate,
): SuggestionNear | null {
  let n: NearStop | null = null;
  if (typeof s.lat === 'number' && typeof s.lng === 'number') {
    n = nearestStop(pins, { lat: s.lat, lng: s.lng });
  } else if (typeof s.distanceMeters === 'number') {
    const a = dayAnchor(pins);
    if (a) n = { stop: a, meters: s.distanceMeters };
  }
  if (!n) return null;
  const dist = nearDistance(n.meters, units);
  return dist ? { dist, name: stopName(n.stop, t) } : null;
}
