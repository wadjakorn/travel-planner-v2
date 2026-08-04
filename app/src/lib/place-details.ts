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
  utc_offset_minutes?: number | null;
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
  utc_offset_minutes: 'utcOffsetMinutes',
};

const PRICE_LEVEL_MAP: Record<string, number> = {
  FREE: 0,
  INEXPENSIVE: 1,
  MODERATE: 2,
  EXPENSIVE: 3,
  VERY_EXPENSIVE: 4,
};

// `prediction` is REQUIRED, and deliberately so — it is a billing guard.
//
// A Place obtained via PlacePrediction.toPlace() carries the autocomplete
// session token on its first fetchFields call, so Google bundles the whole
// session and the Details fetch bills at $0. A bare `new Place({ id })` cannot
// carry a token (FetchFieldsRequest accepts only `fields`), so it bills
// per-request at ~$2.83/1k. Making the session-bound prediction the only way in
// means that regression cannot be reintroduced by forgetting an argument — it
// is a type error instead of a silent line on the bill.
//
// If a genuine bare-id lookup is ever needed, add a separate function with a
// name that says it costs money. Do not add a fallback here.
export async function fetchPlaceDetails(
  prediction: google.maps.places.PlacePrediction,
  legacyFields: string[],
): Promise<PlaceDetails> {
  const fields = legacyFields.map((f) => FIELD_MAP[f] ?? f);
  const p = prediction.toPlace();
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
    utc_offset_minutes:
      (p as { utcOffsetMinutes?: number | null }).utcOffsetMinutes ?? null,
  };
}
