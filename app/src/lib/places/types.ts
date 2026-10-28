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

// 'preview': basic + the photos ref (still the Essentials SKU) for the map preview.
export type Fields = 'basic' | 'full' | 'preview';

export type PlacePhoto = { name: string; attributions: { name: string; uri: string | null }[] };

export type LinkSuggestions = { results: PlaceSuggestion[]; linkError: 'unresolved' | null };

export type PlaceDetail = Omit<PlaceSuggestion, 'lat' | 'lng'> & {
  lat: number;
  lng: number;
  phone: string | null;
  website: string | null;
  hours: string | null;
  rating: number | null;
  reviews: number | null;
  photo?: PlacePhoto | null; // first Google photo; set only for fields === 'preview'
};

export type Located = PlaceSuggestion & { lat: number; lng: number; photo?: PlacePhoto | null };
