export type Kind = 'hotel' | 'food' | 'sight' | 'transit';

export type PlaceSuggestion = {
  id: string; // provider-prefixed, see place-id.ts
  name: string;
  secondary: string | null;
  address: string | null;
  lat: number;
  lng: number;
  kind: Kind;
  timeZone: string | null; // IANA
};

export type LinkSuggestions = { results: PlaceSuggestion[]; linkError: 'unresolved' | null };

export type PlaceDetail = PlaceSuggestion & {
  phone: string | null;
  website: string | null;
  hours: string | null;
};
