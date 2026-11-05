# Scrutiny: TP-0112 plan

**Intent:** a single mis-tap must not permanently delete a place.

**Simpler alternative:** `window.confirm()`.
- Rejected: it is native, can't be styled, and is inconsistent with the app's existing `ConfirmDialog`.
- The dialog version is about 40 lines.

**Trace:**
- `removeAction` is the server action `removePlaceAction` (`app/actions/places.ts:141`). It reads `formData.get('placeId')`, then `removePlace`, then `revalidatePath`/redirect.
  - Calling it with a hand-built `FormData` is equivalent to the form submit. ✔
  - `trip-delete-button.tsx` already does exactly this. ✔
- `ConfirmDialog` is portalled through `Modal`, so the dnd-kit sortable wrapper and row overflow do not clip it. Cancel has default focus, so Enter cancels. ✔
- Both call sites pass the same `removeAction` prop. Viewers never see the button: `canEdit` gates it. ✔
- **Risk:** the e2e selector. It is updated in the same PR, but only verified at the end of the batch.

**Verdict:** ship.
