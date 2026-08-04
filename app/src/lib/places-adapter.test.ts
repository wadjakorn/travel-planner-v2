import { describe, expect, it } from 'vitest';
import { adaptSuggestions, kindFromTypes, type Prediction } from './places-adapter';

// Minimal stand-ins for the live SDK objects. Only the fields adaptSuggestions
// reads are modelled.
type Suggestion = google.maps.places.AutocompleteSuggestion;

function suggestion(id: string, main: string, types?: string[]): Suggestion {
  return {
    placePrediction: {
      placeId: id,
      text: { text: main },
      mainText: { text: main },
      secondaryText: { text: 'Bangkok, Thailand' },
      types,
    },
  } as unknown as Suggestion;
}

describe('adaptSuggestions', () => {
  it('carries the live placePrediction handle through', () => {
    const s = suggestion('abc', 'Wat Pho');
    const [p] = adaptSuggestions([s]);
    // This handle is what keeps Place Details on session billing ($0). If it
    // ever stops being propagated, fetchPlaceDetails has nothing to call
    // toPlace() on and the fetch would bill per-request.
    expect(p.placePrediction).toBe(
      (s as unknown as { placePrediction: unknown }).placePrediction,
    );
    expect(p.place_id).toBe('abc');
    expect(p.structured_formatting).toEqual({
      main_text: 'Wat Pho',
      secondary_text: 'Bangkok, Thailand',
    });
  });

  it('drops suggestions with no placePrediction rather than emitting a partial one', () => {
    const bare = { placePrediction: undefined } as unknown as Suggestion;
    const out = adaptSuggestions([bare, suggestion('ok', 'Chatuchak')]);
    expect(out).toHaveLength(1);
    expect(out[0].place_id).toBe('ok');
    // Every emitted Prediction must be usable for a session-bound Details
    // fetch — that is what makes Prediction.placePrediction non-optional.
    expect(out.every((p: Prediction) => p.placePrediction != null)).toBe(true);
  });

  it('falls back to text when mainText is absent', () => {
    const s = {
      placePrediction: { placeId: 'x', text: { text: 'Full text' } },
    } as unknown as Suggestion;
    expect(adaptSuggestions([s])[0].structured_formatting).toEqual({
      main_text: 'Full text',
      secondary_text: undefined,
    });
  });
});

describe('kindFromTypes', () => {
  it('maps lodging to hotel', () => {
    expect(kindFromTypes(['lodging', 'point_of_interest'])).toBe('hotel');
  });

  it('maps eateries to food', () => {
    expect(kindFromTypes(['restaurant'])).toBe('food');
    expect(kindFromTypes(['cafe'])).toBe('food');
  });

  it('defaults to sight when types are absent or unrecognised', () => {
    expect(kindFromTypes(undefined)).toBe('sight');
    expect(kindFromTypes(['museum'])).toBe('sight');
  });
});
