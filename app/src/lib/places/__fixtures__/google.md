# Google Places (New) fixtures

Live capture 2026-10-24 (TP-0048). 4 calls, inside free tier. Test data only; do not copy into the DB.

| File | Request |
| --- | --- |
| `google-autocomplete.json` | POST `places:autocomplete`, input `jay fai`, `languageCode en`, Bangkok bias (13.75,100.5, r=50000), with `sessionToken` |
| `google-details-basic.json` | GET first suggestion, basic mask (`id,formattedAddress,location,types`), same `sessionToken` |
| `google-details-full.json` | GET first suggestion, full mask (`GOOGLE_MASKS.full`), `languageCode en`, no session |
| `google-details-second.json` | GET second suggestion (`suggestions[1]`), full mask, `languageCode en`, no session |

Shapes follow:
- https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
- https://developers.google.com/maps/documentation/places/web-service/place-details
- https://developers.google.com/maps/documentation/places/web-service/choose-fields

The second suggestion's details are `google-details-second.json`; `google-fake.ts` keys them by that id.
Details are filtered by the request field mask: with the basic mask the fake omits `displayName` and the Enterprise fields, as the real API bills.

## Drift fixed

None. Live responses parsed with the existing `google.ts` parsers unchanged.
