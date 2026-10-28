// Trip-map search preview (TP-0062): the data model shared by the search
// picker and the map, plus the pure rules (ownership, request ordering, camera
// focus, coords caching). React wiring lives in components/map-preview-context.tsx.

import { gmapsSearchUrl } from './gmaps';
import { FIT_MAX_ZOOM, type Pin } from './map-helpers';
import type { Kind, Located, PlacePhoto, PlaceSuggestion } from './places/types';

export const PREVIEW_ZOOM = FIT_MAX_ZOOM;

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
    photo: l.photo ? { src: photoSrc(l.photo), attributions: l.photo.attributions } : null,
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

// Per-picker coords lookup: cached by suggestion id, concurrent calls share one
// request, failures are retried next time.
export function createCoordsResolver(
  fetchCoords: (s: PlaceSuggestion) => Promise<Located | null>,
): (s: PlaceSuggestion) => Promise<Located | null> {
  const done = new Map<string, Located>();
  const inflight = new Map<string, Promise<Located | null>>();
  return (s) => {
    const hit = done.get(s.id);
    if (hit) return Promise.resolve(hit);
    const pending = inflight.get(s.id);
    if (pending) return pending;
    const p = fetchCoords(s)
      .catch(() => null)
      .then((l) => {
        inflight.delete(s.id);
        if (l) done.set(s.id, l);
        return l;
      });
    inflight.set(s.id, p);
    return p;
  };
}
