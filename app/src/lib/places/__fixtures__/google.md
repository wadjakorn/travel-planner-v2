# Google Places (New) fixtures

Hand-written; replace with live capture in Stage B.

Shapes follow:
- https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
- https://developers.google.com/maps/documentation/places/web-service/place-details
- https://developers.google.com/maps/documentation/places/web-service/choose-fields

The place id `ChIJfakeJayFai0001` is fake on purpose.
`ChIJfakeThipsamai0002` (Thipsamai, food) is a second fake place so a "re-pick a different place" flow is testable in fake mode.
Details are filtered by the request field mask: with the basic mask the fake omits `displayName` and the Enterprise fields, as the real API bills.
