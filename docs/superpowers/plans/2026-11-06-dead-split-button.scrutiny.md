# Scrutiny: TP-0111

- **Intent:** stop showing a control that does nothing.
- **Simpler:** this already is the simplest fix (delete 5 lines and 2 keys).
- **Trace:**
  - `budget_split_bills` appears only at this call site. There are no e2e references (grep).
  - The header's action row keeps "Add expense" and "Export CSV". Flex layout, so no gap is left behind.
- **Verdict:** ship. The real feature goes to its own ticket.
