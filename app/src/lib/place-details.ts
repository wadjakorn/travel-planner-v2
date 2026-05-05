// Bridge from the new google.maps.places.Place class (fetchFields) back to
// the legacy PlaceResult shape that the existing UI code reads. Lets us
// migrate off the deprecated PlacesService.getDetails without churning
// every call site.

export type PlaceDetails = {
  name: string | null;
  formatted_address: string | null;
  geometry: { location: google.maps.LatLng | null } | null;
  place_id: string;
  formatted_phone_number?: string | null;
  website?: string | null;
  opening_hours?: { weekday_text: string[] } | null;
  rating?: number | null;
  user_ratings_total?: number | null;
  types?: string[] | null;
  photos?: { getUrl(opts?: google.maps.places.PhotoOptions): string }[] | null;
  url?: string | null;
  price_level?: number | null;
  editorial_summary?: { overview: string } | null;
};

const FIELD_MAP: Record<string, string> = {
  name: 'displayName',
  formatted_address: 'formattedAddress',
  geometry: 'location',
  place_id: 'id',
  formatted_phone_number: 'nationalPhoneNumber',
  website: 'websiteURI',
  opening_hours: 'regularOpeningHours',
  rating: 'rating',
  user_ratings_total: 'userRatingCount',
  types: 'types',
  photos: 'photos',
  url: 'googleMapsURI',
  price_level: 'priceLevel',
  editorial_summary: 'editorialSummary',
};

const PRICE_LEVEL_MAP: Record<string, number> = {
  FREE: 0,
  INEXPENSIVE: 1,
  MODERATE: 2,
  EXPENSIVE: 3,
  VERY_EXPENSIVE: 4,
};

export async function fetchPlaceDetails(
  placesLib: google.maps.PlacesLibrary,
  placeId: string,
  legacyFields: string[],
): Promise<PlaceDetails> {
  const fields = legacyFields.map((f) => FIELD_MAP[f] ?? f);
  const p = new placesLib.Place({ id: placeId });
  await p.fetchFields({ fields });
  const priceLevel = p.priceLevel
    ? PRICE_LEVEL_MAP[p.priceLevel.toUpperCase()] ?? null
    : null;
  return {
    name: p.displayName ?? null,
    formatted_address: p.formattedAddress ?? null,
    geometry: p.location ? { location: p.location } : null,
    place_id: p.id,
    formatted_phone_number: p.nationalPhoneNumber ?? null,
    website: p.websiteURI ?? null,
    opening_hours: p.regularOpeningHours
      ? { weekday_text: p.regularOpeningHours.weekdayDescriptions }
      : null,
    rating: p.rating ?? null,
    user_ratings_total: p.userRatingCount ?? null,
    types: p.types ?? null,
    photos: p.photos
      ? p.photos.map((ph) => ({
          getUrl: (opts?: google.maps.places.PhotoOptions) => ph.getURI(opts),
        }))
      : null,
    url: p.googleMapsURI ?? null,
    price_level: priceLevel,
    editorial_summary: p.editorialSummary ? { overview: p.editorialSummary } : null,
  };
}
