import type { Pin } from '@/lib/map-helpers';

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
};

export type PinPickerMapProps = {
  center: LatLng;
  value: LatLng | null;
  onPick: (p: LatLng) => void;
  zoom?: number;
};
