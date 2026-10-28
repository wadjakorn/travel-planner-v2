// Trip-map search preview (TP-0062): the data model shared by the search
// picker and the map, plus the pure rules (ownership, request ordering, camera
// focus, coords caching). React wiring lives in components/map-preview-context.tsx.

import { gmapsSearchUrl } from './gmaps';
import { FIT_MAX_ZOOM, type Pin } from './map-helpers';
import type { Kind, Located, PlacePhoto, PlaceSuggestion } from './places/types';

export const PREVIEW_ZOOM = FIT_MAX_ZOOM;
// The preview pin sits this far below the map centre so its card (above it) fits.
export const PREVIEW_OFFSET_Y = 120;

export type MapPreviewPhoto = { src: string; attributions: PlacePhoto['attributions'] };

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

export function photoSrc(p: PlacePhoto): string {
  return `/api/places/photo?name=${encodeURIComponent(p.name)}`;
}

export function toPreviewPhoto(p: PlacePhoto | null | undefined): MapPreviewPhoto | null {
  return p ? { src: photoSrc(p), attributions: p.attributions } : null;
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
    photo: toPreviewPhoto(l.photo),
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

export type MapFocus = { kind: 'preview' | 'active'; lat: number; lng: number } | { kind: 'fit' };

// A freshly selected place wins over a preview that is about to be cleared,
// so a pin click moves the camera once, not preview-then-pin.
export function mapFocus(
  preview: { lat: number; lng: number } | null,
  activePin: Pin | null,
  activeChanged: boolean,
): MapFocus {
  if (activeChanged && activePin) return { kind: 'active', lat: activePin.lat, lng: activePin.lng };
  if (preview) return { kind: 'preview', lat: preview.lat, lng: preview.lng };
  if (activePin) return { kind: 'active', lat: activePin.lat, lng: activePin.lng };
  return { kind: 'fit' };
}

// Keyed async lookup for the page session: cached by key, concurrent calls
// share one request, a throw is retried next time. `cacheNull` also remembers
// "nothing there" (e.g. a place with no photo) so it is not asked again.
export function createCachedLookup<T>(
  fetchOne: (key: string) => Promise<T | null>,
  o: { cacheNull?: boolean } = {},
): (key: string) => Promise<T | null> {
  const done = new Map<string, T | null>();
  const inflight = new Map<string, Promise<T | null>>();
  return (key) => {
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
