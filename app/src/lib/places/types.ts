export type Kind = 'hotel' | 'food' | 'sight' | 'transit';

export type PlaceSuggestion = {
  id: string; // provider-prefixed, see place-id.ts
  name: string;
  secondary: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  kind: Kind;
  timeZone: string | null; // IANA
};

export type Fields = 'basic' | 'full';

export type PlaceDetail = Omit<PlaceSuggestion, 'lat' | 'lng'> & {
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  hours: string | null;
  rating: number | null;
  reviews: number | null;
};

export type Located = PlaceSuggestion & { lat: number; lng: number };
