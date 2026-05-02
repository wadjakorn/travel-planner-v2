# Travel Planner v2

Wanderlog-style travel planner. Pure HTML/CSS/JS prototype using React 18 via CDN + Babel standalone. No build step.

## Entry point
`index.html` — open directly in browser or serve with any static server. Originally shipped from Claude Design as `Travel Planner.html`; renamed so static servers serve it at `/`.

## Architecture
Single-page app, all scripts loaded in order:

| File | Role |
|------|------|
| `design-tokens.css` | Appled UI color/type tokens |
| `styles.css` | App shell, itinerary, map, place cards |
| `bookings.css` | Hotels/transport mgmt views + modal |
| `other-views.css` | Calendar, budget, notes |
| `account.css` | Dark/light theme tokens, sign-in, settings |
| `apple-polish.css` | HIG overrides + mobile responsive |
| `data.js` | Trip data (TRIP, SEARCH_RESULTS) |
| `bookings-data.js` | BOOKINGS (hotels + transport) |
| `i18n.js` | I18N strings (en/th), ACCOUNTS, INVITES |
| `icons.jsx` | Ico icon library (window.Ico) |
| `map.jsx` | MapCanvas SVG component |
| `place-row.jsx` | PlaceRow, Segment, gmaps URL helpers |
| `sidebar-parts.jsx` | DayHeader, OptimizeStrip, AddPlace, Recco, TripCover |
| `bookings-views.jsx` | HotelsView, TransportView |
| `add-booking-modal.jsx` | AddBookingModal (multi-step) |
| `other-views.jsx` | CalendarView, BudgetView, NotesView |
| `account.jsx` | SignInScreen, AccountMenu, SettingsModal, InviteModal |
| `app.jsx` | App root — all state, routing, orchestration |

## Key patterns
- All components exported to `window.*` (no modules — CDN React)
- Theme: `data-theme` attr on `<html>` ("light"/"dark")
- Rail views: `view` state = `itinerary|calendar|hotels|transport|budget|notes`
- Mobile: single-column + bottom tab bar at ≤768px

## Dev
```bash
npx serve .
# or
python3 -m http.server 3000
```
