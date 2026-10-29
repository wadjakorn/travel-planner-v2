'use client';

// Budget settings: trip currency, the target amount and how it was meant
// (total / per person / per day), and optional per-category caps.
//
// Client-side only for the disclosure and for the currency-change warning,
// which has to appear *before* the user submits — the whole point is that they
// see how many existing rows a currency switch would strand.

import { useState } from 'react';
import { ActionForm, ActionError, ActionSubmit } from '@/components/action-form';
import type { ActionResult } from '@/lib/action-result';
import { COMMON_CURRENCIES } from '@/lib/currency';
import type { BudgetBasis, ExpenseCategory } from '@/db/schema';
import styles from './budget-view.module.css';
import { SettingsSegmented } from '@/components/settings-folio';
import { useT, useTp } from '@/components/i18n-provider';
import type { MessageKey } from '@/lib/i18n-client';

type Props = {
  tripId: string;
  currency: string;
  amount: number | null;
  basis: BudgetBasis;
  caps: Partial<Record<ExpenseCategory, number>>;
  // Explicit per-person divisor; null = fall back to trip members, whose
  // count (travelersDefault) is shown as the placeholder.
  travelers: number | null;
  travelersDefault: number;
  // Rows currently carrying the trip's existing currency. Switching currency
  // strands exactly these unless the user opts to relabel them.
  affectedRows: number;
  // Labels are looked up here (CAT_KEY), so server callers pass ids.
  categories: ExpenseCategory[];
  action: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  compact?: boolean;
};

// Labels only: the stored value is the id. (No `_other` key suffix: that is
// reserved for plurals, so the 'other' category reads budget_cat_misc.)
const CAT_KEY: Record<ExpenseCategory, MessageKey> = {
  transport: 'budget_cat_transport',
  hotels: 'budget_cat_hotels',
  food: 'budget_cat_food',
  activities: 'budget_cat_activities',
  shopping: 'budget_cat_shopping',
  other: 'budget_cat_misc',
};

// Labels only: the stored value is the basis id.
const BASIS_LABELS: Array<{ id: BudgetBasis; labelKey: MessageKey }> = [
  { id: 'total', labelKey: 'budget_basis_total' },
  { id: 'per_person', labelKey: 'budget_basis_per_person' },
  { id: 'per_day', labelKey: 'budget_basis_per_day' },
];

export function BudgetSettingsForm({
  tripId,
  currency,
  amount,
  basis,
  caps,
  travelers,
  travelersDefault,
  affectedRows,
  categories,
  action,
  compact = true,
}: Props) {
  const t = useT();
  const tp = useTp();
  const [open, setOpen] = useState(false);
  const [nextCurrency, setNextCurrency] = useState(currency);

  const currencyChanged = nextCurrency !== currency;
  const options = [...new Set([currency, ...COMMON_CURRENCIES])];
  // One sentence with a bold "not converted": split around {strong}.
  const [relabelBefore, relabelAfter = ''] = tp('budget_relabel_body', affectedRows, {
    from: currency,
    to: nextCurrency,
  }).split('{strong}');

  return (
    <div className={styles.settings}>
      {compact ? (
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? t('budget_settings_close') : t('budget_settings_open')}
        </button>
      ) : null}

      {(!compact || open) && (
        <ActionForm
          action={action}
          successMessage={t('budget_saved_toast')}
          className={styles.settingsForm}
        >
          <input type="hidden" name="tripId" value={tripId} />

          <div className={styles.settingsRow}>
            <label className={styles.settingsField}>
              <span className={styles.settingsLabel}>{t('budget_currency_label')}</span>
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
              <span className={styles.settingsLabel}>{t('budget_amount_label')}</span>
              <input
                name="amount"
                defaultValue={amount ?? ''}
                inputMode="decimal"
                placeholder={t('budget_amount_placeholder')}
                className={styles.settingsInput}
              />
            </label>

          </div>

          {/* Its own full-width row: as a third grid column the option labels
              wrap to four lines in the narrower settings pane. */}
          <SettingsSegmented
            name="basis"
            label={t('budget_basis_label')}
            defaultValue={basis}
            options={BASIS_LABELS.map((b) => ({ value: b.id, label: t(b.labelKey) }))}
          />

          <label className={styles.settingsField}>
            <span className={styles.settingsLabel}>{t('budget_travelers_label')}</span>
            <input
              name="travelers"
              type="number"
              min={1}
              max={99}
              step={1}
              defaultValue={travelers ?? ''}
              inputMode="numeric"
              placeholder={String(travelersDefault)}
              aria-describedby={`travelers-hint-${tripId}`}
              className={styles.settingsInput}
            />
            <span id={`travelers-hint-${tripId}`} className={styles.settingsHint}>
              {t('budget_travelers_hint')}
            </span>
          </label>

          {currencyChanged && (
            <label className={styles.settingsWarn}>
              <input type="checkbox" name="migrateCurrency" defaultChecked />
              <span>
                {affectedRows > 0 ? (
                  <>
                    {relabelBefore}
                    <strong>{t('budget_relabel_not_converted')}</strong>
                    {relabelAfter}
                  </>
                ) : (
                  t('budget_relabel_none', { currency })
                )}
              </span>
            </label>
          )}

          <fieldset className={styles.settingsCaps}>
            <legend className={styles.settingsLabel}>{t('budget_caps_legend')}</legend>
            {categories.map((id) => (
              <label key={id} className={styles.settingsCap}>
                <span>{t(CAT_KEY[id])}</span>
                <input
                  name={`cap_${id}`}
                  defaultValue={caps[id] ?? ''}
                  inputMode="decimal"
                  placeholder="—"
                  className={styles.settingsInput}
                />
              </label>
            ))}
          </fieldset>

          <ActionError />

          {/* Saving can also relabel every expense and booking on the trip, so
              the round-trip is not instant; the spinner + disabled state stop a
              button that looks idle from inviting a second click. */}
          <ActionSubmit size="sm" className="self-end rounded-full">
            {t('budget_save')}
          </ActionSubmit>
        </ActionForm>
      )}
    </div>
  );
}
