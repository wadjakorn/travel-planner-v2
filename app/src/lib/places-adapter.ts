export type Kind = 'hotel' | 'food' | 'sight' | 'transit';

export type Prediction = {
  place_id: string;
  structured_formatting: { main_text: string; secondary_text?: string };
  types?: string[];
  // Live SDK handle for the underlying autocomplete result. Kept so the
  // terminating Place Details fetch can go through PlacePrediction.toPlace(),
  // whose first fetchFields call automatically carries the session token →
  // the whole Autocomplete session bills at $0 instead of $2.83/1k.
  placePrediction?: google.maps.places.PlacePrediction;
};

export function adaptSuggestions(
  s: google.maps.places.AutocompleteSuggestion[],
): Prediction[] {
  const out: Prediction[] = [];
  for (const sug of s) {
    const p = sug.placePrediction;
    if (!p) continue;
    out.push({
      place_id: p.placeId,
      structured_formatting: {
        main_text: p.mainText?.text ?? p.text.text,
        secondary_text: p.secondaryText?.text,
      },
      types: p.types,
      placePrediction: p,
    });
  }
  return out;
}

export function kindFromTypes(types: readonly string[] | undefined): Kind {
  if (!types) return 'sight';
  if (types.includes('lodging')) return 'hotel';
  if (
    types.includes('restaurant') ||
    types.includes('cafe') ||
    types.includes('bar') ||
    types.includes('bakery') ||
    types.includes('meal_takeaway') ||
    types.includes('meal_delivery') ||
    types.includes('food')
  )
    return 'food';
  if (
    types.includes('transit_station') ||
    types.includes('subway_station') ||
    types.includes('train_station') ||
    types.includes('bus_station') ||
    types.includes('airport') ||
    types.includes('light_rail_station')
  )
    return 'transit';
  return 'sight';
}
