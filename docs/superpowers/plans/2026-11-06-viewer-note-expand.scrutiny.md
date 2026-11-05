# Scrutiny: TP-0134 plan

**Intent:** a viewer can read the whole note of a stop.

**Simpler alternatives:**
- *Show every viewer note in full, always.* This makes long days very tall, and differs from what editors see.
- *A read-only note modal.* This needs a button, a modal, and new copy.

A disclosure on the row reuses the existing expanded body with no new UI, so the plan keeps it.

**Trace:**
- `PlaceRow(active)` renders `placeExpanded`, including `PlaceRowPhoto`. That image request is the same one an editor's selection triggers, so it adds no new cost class.
- `StaticItem` is in a `'use client'` file, so `useState` is fine.
- `rowHoverHandlers` sits on the parent div, so map hover still works.

**Risk:** a nested interactive conflict. The expanded body contains `<a>` links, so toggling only when `!target.closest('a,button,input,textarea,select')` avoids collapsing on a link tap.

**Verdict:** ship.
