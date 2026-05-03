// ExpenseForm — server component used by both add-expense and edit-expense flows.
// The `action` prop is a server action supplied by the caller; no client JS here.

import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import baseStyles from './trip-create-form.module.css';
import styles from './place-form.module.css';

type ExpenseCategory =
  | 'transport'
  | 'hotels'
  | 'food'
  | 'activities'
  | 'shopping'
  | 'other';

type ExpenseFormValues = {
  category: ExpenseCategory;
  label?: string | null;
  amount: number;
  currency: string;         // ISO; default "USD"
  dayIdx?: number | null;
  note?: string | null;
  at?: string | null;       // ISO yyyy-mm-dd; default today
};

type Props = {
  mode: 'add' | 'edit';
  action: (formData: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  initial?: Partial<ExpenseFormValues>;
  cancelHref?: string;
};

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  transport: 'Transport',
  hotels: 'Hotels',
  food: 'Food',
  activities: 'Activities',
  shopping: 'Shopping',
  other: 'Other',
};

const TODAY = new Date().toISOString().slice(0, 10);

export function ExpenseForm({ mode, action, hidden, initial, cancelHref = '/' }: Props) {
  const isEdit = mode === 'edit';
  const v = initial ?? {};

  return (
    <div className={signInStyles.wrap}>
      <div className={signInStyles.bg} aria-hidden>
        <div className={`${signInStyles.blob} ${signInStyles.b1}`} />
        <div className={`${signInStyles.blob} ${signInStyles.b2}`} />
        <div className={`${signInStyles.blob} ${signInStyles.b3}`} />
      </div>

      <div className={`${signInStyles.card} ${styles.card}`}>
        <div className={signInStyles.brand}>
          <svg viewBox="0 0 32 32" fill="currentColor" width="36" height="36" aria-hidden>
            <path d="M16 3.2c-3.4 0-5.5 2-7.6 2-2.2 0-4.6-1.9-6.6.5C-.6 8.5.4 14.6 3.6 19.7c1.6 2.5 3.7 5.3 6.5 5.2 2.6-.1 3.6-1.7 6.7-1.7 3.1 0 4 1.7 6.7 1.6 2.8-.1 4.6-2.6 6.3-5.1 1.9-2.9 2.7-5.7 2.7-5.9-.1 0-5.2-2-5.3-7.9 0-4.9 4-7.3 4.2-7.4-2.3-3.4-5.9-3.8-7.2-3.9-3.3-.3-6 1.9-7.5 1.9z" />
          </svg>
          <h1>{isEdit ? 'Edit expense' : 'Add expense'}</h1>
        </div>

        <form action={action} className={baseStyles.form}>
          {/* Hidden inputs (tripId, expenseId, etc.) */}
          {Object.entries(hidden ?? {}).map(([k, val]) => (
            <input key={k} type="hidden" name={k} value={val} />
          ))}

          {/* Category (required) */}
          <div className={baseStyles.field}>
            <label htmlFor="ef-category" className={baseStyles.label}>
              Category
            </label>
            <select
              id="ef-category"
              name="category"
              required
              defaultValue={v.category ?? 'other'}
              className={baseStyles.input}
            >
              {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          {/* Label (optional) */}
          <div className={baseStyles.field}>
            <label htmlFor="ef-label" className={baseStyles.label}>
              Label
            </label>
            <input
              id="ef-label"
              name="label"
              type="text"
              defaultValue={v.label ?? ''}
              placeholder="Sushi Saito dinner"
              className={baseStyles.input}
            />
          </div>

          {/* Row: amount + currency */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="ef-amount" className={baseStyles.label}>
                Amount
              </label>
              <input
                id="ef-amount"
                name="amount"
                type="number"
                required
                min={0}
                step={0.01}
                defaultValue={v.amount ?? ''}
                placeholder="0.00"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="ef-currency" className={baseStyles.label}>
                Currency
              </label>
              <input
                id="ef-currency"
                name="currency"
                type="text"
                defaultValue={v.currency ?? 'USD'}
                placeholder="USD"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Date (optional, default today) */}
          <div className={baseStyles.field}>
            <label htmlFor="ef-at" className={baseStyles.label}>
              Date
            </label>
            <input
              id="ef-at"
              name="at"
              type="date"
              defaultValue={v.at ?? TODAY}
              className={baseStyles.input}
            />
          </div>

          {/* Day index (optional) */}
          <div className={baseStyles.field}>
            <label htmlFor="ef-dayIdx" className={baseStyles.label}>
              Day index
            </label>
            <input
              id="ef-dayIdx"
              name="dayIdx"
              type="number"
              min={0}
              defaultValue={v.dayIdx ?? ''}
              placeholder="0-based day index for the spend"
              className={baseStyles.input}
            />
          </div>

          {/* Note (optional, textarea) */}
          <div className={baseStyles.field}>
            <label htmlFor="ef-note" className={baseStyles.label}>
              Note
            </label>
            <textarea
              id="ef-note"
              name="note"
              rows={2}
              defaultValue={v.note ?? ''}
              placeholder="Any notes…"
              className={`${baseStyles.input} ${styles.textarea}`}
            />
          </div>

          {/* Actions row */}
          <div className={baseStyles.row} style={{ marginTop: 8 }}>
            <Link href={cancelHref} className={baseStyles.cancelBtn}>
              Cancel
            </Link>
            <SubmitButton className={signInStyles.btn} pendingText={<span>Saving…</span>}>
              <span>{isEdit ? 'Save changes' : 'Add expense'}</span>
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
