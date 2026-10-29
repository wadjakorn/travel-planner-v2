import type { LatLng, MapLeg, Pin } from '@/lib/map-helpers';
import type { MapPreview } from '@/lib/map-preview';
import type { HoverSource } from '@/lib/maps/hover-store';
import type { BBox } from '@/lib/places/bias';

// Props shared by every renderer of a map surface, so the selector and the
// MapLibre / Google implementations stay interchangeable.

export type { LatLng };

export type RealMapCanvasProps = {
  dayLabel: string;
  /** Screen-reader description of the shown day (lib/map-a11y mapSummary), built by the owner. */
  summary?: string;
  totalDistance?: string | null;
  totalTime?: string | null;
  pins: Pin[];
  /** Visit-order legs of the shown day; positions index `pins`. */
  legs?: MapLeg[];
  activePlaceId?: string | null;
  onActivate?: (id: string) => void;
  /** raw camera bounds whenever the camera settles; the owner normalizes/tags */
  onViewport?: (b: BBox) => void;
  /**
   * The shown day's hovered stop (lib/maps/hover-store), the canvas's only hover
   * state: either source lifts the pin; only a pin hover (`map`) adds a tooltip.
   */
  hover?: { placeId: string; source: HoverSource } | null;
  /** Mouse pointer entered (id) / left (null) a pin. */
  onPinHover?: (id: string | null) => void;
  /** Search-result preview pin + card (TP-0062); not a trip stop. */
  preview?: MapPreview | null;
  /** Skip the active pin's card: the mobile stop carousel shows it instead. */
  hidePinCard?: boolean;
  /** "≈ 350 m from Tsuta Ramen": the preview's nearest stop of the shown day. */
  previewNear?: string | null;
  /** Google renderer only: a tapped Google POI (its own info window is suppressed). */
  onPoiClick?: (placeId: string) => void;
  /** Empty day: points to frame instead of the day's pins (lib/map-helpers emptyDayFallback). */
  fallbackFrame?: LatLng[];
  /** Empty day: "No places on Day 2 yet · showing Day 1", shown in place of the distance chips. */
  emptyNote?: string | null;
};

export type PinPickerMapProps = {
  center: LatLng;
  value: LatLng | null;
  onPick: (p: LatLng) => void;
  zoom?: number;
  /** Fires with the map centre whenever the camera settles (and once after load). */
  onCenterChange?: (c: LatLng) => void;
  /** Recentre request: a new object = a new request (identity, not value, triggers it). */
  focus?: LatLng | null;
};

/** Zoom floor when the picker recentres on a typed/pasted location. */
export const PICKER_FOCUS_ZOOM = 15;
