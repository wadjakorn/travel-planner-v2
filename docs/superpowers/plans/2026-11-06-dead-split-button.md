# TP-0111: the "Split bills" button on Budget does nothing

## Finding
- `components/budget-view.tsx` renders `<button type="button">Split bills</button>` for editors.
- The button has no handler, no link and no feature behind it.
- `expense_split` rows exist per expense, but there is no settle-up or "who owes whom" computation or view anywhere (`lib/expense-queries.ts`, components).

## Options
1. **Build split bills / settle up:**
   - per-person balances from `expense.paid_by` plus `expense_split`;
   - a minimal set of transfers;
   - a view.
   This is a feature with product decisions: currency mixing, travellers who are not members, and settled state.
2. **Remove the dead button now.** File (1) as its own feature ticket for the owner to decide.

**Choice:** option 2. The ticket asks the owner to choose, but a control that does nothing is a bug either way. Removing it is reversible and does not pre-empt the feature decision.

## Change
- Remove the button.
- Remove the now-orphan `budget_split_bills` en/th keys.
- New backlog ticket: "Budget: settle up / split bills" with the questions above.

## Tests
typecheck, lint, i18n parity.
