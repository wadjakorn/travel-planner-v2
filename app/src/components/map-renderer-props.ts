import type { Pin } from '@/lib/map-helpers';
import type { MapPreview } from '@/lib/map-preview';
import type { BBox } from '@/lib/places/bias';

// Props shared by every renderer of a map surface, so the selector and the
// MapLibre / Google implementations stay interchangeable.

export type LatLng = { lat: number; lng: number };

export type RealMapCanvasProps = {
  dayLabel: string;
  totalDistance?: string | null;
  totalTime?: string | null;
  pins: Pin[];
  activePlaceId?: string | null;
  onActivate?: (id: string) => void;
  /** raw camera bounds whenever the camera settles; the owner normalizes/tags */
  onViewport?: (b: BBox) => void;
  /** Search-result preview pin + card (TP-0062); not a trip stop. */
  preview?: MapPreview | null;
  /** Skip the active pin's card: the mobile stop carousel shows it instead. */
  hidePinCard?: boolean;
  /** "≈ 350 m from Tsuta Ramen": the preview's nearest stop of the shown day. */
  previewNear?: string | null;
  /** Google renderer only: a tapped Google POI (its own info window is suppressed). */
  onPoiClick?: (placeId: string) => void;
};

export type PinPickerMapProps = {
  center: LatLng;
  value: LatLng | null;
  onPick: (p: LatLng) => void;
  zoom?: number;
};
