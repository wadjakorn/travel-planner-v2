'use client';

// ExpenseForm — intent-first Add/Edit expense form, sharing the shell of the
// booking forms (pinned header, scrolling body, sticky footer). Adding a spend
// and adding a booking are the same kind of task and now look it.
//
// Two things the old version got wrong and this one drops:
//
// - **Currency.** It was a per-row field. A trip has exactly one currency, set
//   in budget settings; a row in any other currency simply falls out of the
//   total. So the currency is shown here as a fact next to the amount, and the
//   server reads it from the trip — there is no way to pick a wrong one.
// - **"Day index".** A raw 0-based integer input. Replaced with the trip's
//   actual days; the value on the wire is unchanged.

import { forwardRef, useImperativeHandle, useState } from 'react';
import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui';
import { Wallet, Close, Plane, Bed, Fork, MapPin, Sparkle, Note } from '@/components/icons';
import { useDirtyForm } from './use-dirty-form';
import { ConfirmDialog } from './confirm-dialog';
import styles from './expense-form.module.css';

// Imperative handle so an overlay host (the budget page's expense modal) can
// route its own close requests (Escape, backdrop click) through this form's
// dirty check — same convention as HotelFormHandle / TransportFormHandle.
export type ExpenseFormHandle = { requestClose: (close: () => void) => void };

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
  dayIdx?: number | null;
  note?: string | null;
  at?: string | null; // ISO yyyy-mm-dd; default today
};

type Props = {
  mode: 'add' | 'edit';
  action: (formData: FormData) => Promise<void>;
  deleteAction?: (formData: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  initial?: Partial<ExpenseFormValues>;
  cancelHref?: string;
  // The trip's currency — displayed, never submitted. The server takes it
  // from the trip row.
  tripCurrency: string;
  // The trip's days, for tagging the spend to one. Empty on a trip with no
  // days yet, in which case the picker is hidden rather than shown empty.
  days?: Array<{ idx: number; label: string }>;
  bookingsHref?: string;
  // Overlay mode: when supplied, Cancel is a button (not a Link to
  // cancelHref) and onDone fires once the submit/delete action resolves, so
  // the caller (a Modal host) can close itself. cancelHref keeps working
  // unchanged for the standalone routes that pass neither prop.
  onDone?: () => void;
  onCancel?: () => void;
};

const CATS: Array<{
  id: ExpenseCategory;
  label: string;
  color: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}> = [
  { id: 'transport', label: 'Transport', color: '#0071e3', Icon: Plane },
  { id: 'hotels', label: 'Hotels', color: '#5b3fd9', Icon: Bed },
  { id: 'food', label: 'Food', color: '#ff8a3d', Icon: Fork },
  { id: 'activities', label: 'Activities', color: '#29a847', Icon: MapPin },
  { id: 'shopping', label: 'Shopping', color: '#ef476f', Icon: Sparkle },
  { id: 'other', label: 'Other', color: '#86868b', Icon: Note },
];

const TODAY = new Date().toISOString().slice(0, 10);

export const ExpenseForm = forwardRef<ExpenseFormHandle, Props>(function ExpenseForm(
  {
    mode,
    action,
    deleteAction,
    hidden,
    initial,
    cancelHref = '/',
    tripCurrency,
    days = [],
    bookingsHref,
    onDone,
    onCancel,
  }: Props,
  fref,
) {
  const isEdit = mode === 'edit';
  const v = initial ?? {};

  const [category, setCategory] = useState<ExpenseCategory>(v.category ?? 'food');
  const [amount, setAmount] = useState(v.amount != null ? String(v.amount) : '');
  const hasNote = Boolean(v.note);

  const { formRef, markClean, requestClose, confirmOpen, confirmDiscard, cancelDiscard } =
    useDirtyForm();
  useImperativeHandle(fref, () => ({ requestClose }), [requestClose]);

  async function submit(formData: FormData) {
    await action(formData);
    markClean();
    onDone?.();
  }

  async function submitDelete(formData: FormData) {
    if (!deleteAction) return;
    await deleteAction(formData);
    markClean();
    onDone?.();
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.panel}>
        <form ref={formRef} action={onDone ? submit : action} className={styles.formShell}>
          {Object.entries(hidden ?? {}).map(([k, val]) => (
            <input key={k} type="hidden" name={k} value={val} />
          ))}
          <input type="hidden" name="category" value={category} />

          {/* Header */}
          <div className={styles.head}>
            <span className={styles.headIco} aria-hidden>
              <Wallet width={18} height={18} />
            </span>
            <h1 className={styles.headTitle}>{isEdit ? 'Edit expense' : 'Add expense'}</h1>
            {onCancel ? (
              <button
                type="button"
                onClick={() => requestClose(onCancel)}
                className={styles.headX}
                aria-label="Cancel"
              >
                <Close width={16} height={16} />
              </button>
            ) : (
              <Link href={cancelHref} className={styles.headX} aria-label="Cancel">
                <Close width={16} height={16} />
              </Link>
            )}
          </div>

          {/* Body */}
          <div className={styles.body}>
            {/* Amount */}
            <div className={styles.group}>
              <p className={styles.lbl}>Amount</p>
              <div className={styles.amountBox}>
                <span className={styles.amountCur}>{tripCurrency}</span>
                <input
                  className={styles.amountInput}
                  name="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  required
                  placeholder="0.00"
                  aria-label={`Amount in ${tripCurrency}`}
                />
              </div>
            </div>

            {/* Category */}
            <div className={styles.group}>
              <p className={styles.lbl}>Category</p>
              <div className={styles.cats} role="group" aria-label="Category">
                {CATS.map(({ id, label, color, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={styles.cat}
                    aria-pressed={category === id}
                    onClick={() => setCategory(id)}
                    style={category === id ? { color } : undefined}
                  >
                    <Icon width={17} height={17} aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* What + when */}
            <div className={styles.group}>
              <label className={styles.field}>
                <span className={styles.fl}>What was it?</span>
                <input
                  className={styles.input}
                  name="label"
                  defaultValue={v.label ?? ''}
                  placeholder="Sushi Saito dinner"
                />
              </label>

              <div className={styles.row2} style={{ marginTop: 10 }}>
                <label className={styles.field}>
                  <span className={styles.fl}>Date</span>
                  <input
                    className={styles.input}
                    type="date"
                    name="at"
                    defaultValue={v.at ?? TODAY}
                  />
                </label>

                {days.length > 0 && (
                  <label className={styles.field}>
                    <span className={styles.fl}>Trip day</span>
                    <select
                      className={styles.input}
                      name="dayIdx"
                      defaultValue={v.dayIdx != null ? String(v.dayIdx) : ''}
                    >
                      <option value="">Not tied to a day</option>
                      {days.map((d) => (
                        <option key={d.idx} value={d.idx}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>

            {/* Booking costs already count. Say so here, where someone is
                about to type one in by hand. */}
            {!isEdit && (
              <div className={styles.note}>
                <span>
                  Hotel and transport costs entered on{' '}
                  {bookingsHref ? <Link href={bookingsHref}>your bookings</Link> : 'your bookings'}{' '}
                  already count toward this budget — no need to add them again.
                </span>
              </div>
            )}

            <details className={styles.more} open={hasNote}>
              <summary className={styles.moreSummary}>
                Additional info <span className={styles.moreHint}>note</span>
                <svg
                  className={styles.moreChev}
                  viewBox="0 0 12 8"
                  width="12"
                  height="8"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  aria-hidden
                >
                  <path d="M1 1l5 5 5-5" />
                </svg>
              </summary>
              <div className={styles.moreBody}>
                <textarea
                  className={styles.input}
                  name="note"
                  rows={3}
                  defaultValue={v.note ?? ''}
                  placeholder="Any notes…"
                />
              </div>
            </details>

            {isEdit && deleteAction && (
              <div className={styles.delRow}>
                <SubmitButton formAction={onDone ? submitDelete : deleteAction} formNoValidate variant="danger">
                  Delete expense
                </SubmitButton>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={styles.foot}>
            {onCancel ? (
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => requestClose(onCancel)}
              >
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost" className="flex-1">
                <Link href={cancelHref}>Cancel</Link>
              </Button>
            )}
            <SubmitButton variant="primary" className="flex-[1.4]" pendingText={<span>Saving…</span>}>
              <span>{isEdit ? 'Save changes' : 'Add expense'}</span>
            </SubmitButton>
          </div>
        </form>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Discard changes?"
        message="You have unsaved changes to this expense. Discard them?"
        confirmLabel="Discard"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </div>
  );
});
