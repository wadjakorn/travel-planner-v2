'use client';

// Budget settings: trip currency, the target amount and how it was meant
// (total / per person / per day), and optional per-category caps.
//
// Client-side only for the disclosure and for the currency-change warning,
// which has to appear *before* the user submits — the whole point is that they
// see how many existing rows a currency switch would strand.

import { useState } from 'react';
import { SubmitButton } from '@/components/submit-button';
import { COMMON_CURRENCIES } from '@/lib/currency';
import type { BudgetBasis, ExpenseCategory } from '@/db/schema';
import styles from './budget-view.module.css';

type Props = {
  tripId: string;
  currency: string;
  amount: number | null;
  basis: BudgetBasis;
  caps: Partial<Record<ExpenseCategory, number>>;
  // Rows currently carrying the trip's existing currency. Switching currency
  // strands exactly these unless the user opts to relabel them.
  affectedRows: number;
  categories: Array<{ id: ExpenseCategory; label: string }>;
  action: (formData: FormData) => Promise<void>;
};

const BASIS_LABELS: Array<{ id: BudgetBasis; label: string }> = [
  { id: 'total', label: 'Total for the trip' },
  { id: 'per_person', label: 'Per person' },
  { id: 'per_day', label: 'Per day' },
];

export function BudgetSettingsForm({
  tripId,
  currency,
  amount,
  basis,
  caps,
  affectedRows,
  categories,
  action,
}: Props) {
  const [open, setOpen] = useState(false);
  const [nextCurrency, setNextCurrency] = useState(currency);

  const currencyChanged = nextCurrency !== currency;
  const options = [...new Set([currency, ...COMMON_CURRENCIES])];

  return (
    <div className={styles.settings}>
      <button
        type="button"
        className={styles.ghostBtn}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Close budget settings' : 'Budget settings'}
      </button>

      {open && (
        <form action={action} className={styles.settingsForm}>
          <input type="hidden" name="tripId" value={tripId} />

          <div className={styles.settingsRow}>
            <label className={styles.settingsField}>
              <span className={styles.settingsLabel}>Currency</span>
              <select
                name="currency"
                value={nextCurrency}
                onChange={(e) => setNextCurrency(e.target.value)}
                className={styles.settingsInput}
              >
                {options.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>

            <label className={styles.settingsField}>
              <span className={styles.settingsLabel}>Budget amount</span>
              <input
                name="amount"
                defaultValue={amount ?? ''}
                inputMode="decimal"
                placeholder="Leave blank for no budget"
                className={styles.settingsInput}
              />
            </label>

            <label className={styles.settingsField}>
              <span className={styles.settingsLabel}>Counted as</span>
              <select name="basis" defaultValue={basis} className={styles.settingsInput}>
                {BASIS_LABELS.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </label>
          </div>

          {currencyChanged && (
            <label className={styles.settingsWarn}>
              <input type="checkbox" name="migrateCurrency" defaultChecked />
              <span>
                {affectedRows > 0 ? (
                  <>
                    {affectedRows} existing {affectedRows === 1 ? 'entry is' : 'entries are'} recorded
                    in {currency}. Relabel {affectedRows === 1 ? 'it' : 'them'} as {nextCurrency} too —
                    the numbers are <strong>not converted</strong>. Unchecked, they stop counting
                    toward the total.
                  </>
                ) : (
                  <>No existing entries are recorded in {currency}, so nothing will be relabelled.</>
                )}
              </span>
            </label>
          )}

          <fieldset className={styles.settingsCaps}>
            <legend className={styles.settingsLabel}>Per-category caps (optional)</legend>
            {categories.map((c) => (
              <label key={c.id} className={styles.settingsCap}>
                <span>{c.label}</span>
                <input
                  name={`cap_${c.id}`}
                  defaultValue={caps[c.id] ?? ''}
                  inputMode="decimal"
                  placeholder="—"
                  className={styles.settingsInput}
                />
              </label>
            ))}
          </fieldset>

          {/* pendingText matters here: saving can also relabel every expense
              and booking on the trip, so the round-trip is not instant and a
              button that looks idle invites a second click. */}
          <SubmitButton className={styles.addBtn} pendingText={<span>Saving…</span>}>
            <span>Save budget</span>
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
