// TransportForm — server component used by both add-transport and edit-transport flows.
// The `action` prop is a server action supplied by the caller; no client JS here.

import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { TransportFormRouteFields } from './transport-form-route-fields';
import { TransportFormMetaFields } from './transport-form-meta-fields';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import baseStyles from './trip-create-form.module.css';
import placeStyles from './place-form.module.css';
import styles from './transport-form.module.css';

type TransportType = 'flight' | 'train' | 'car' | 'ferry';

type TransportFormValues = {
  type: TransportType;
  dayIdx?: number | null;
  title: string;
  provider?: string | null;
  ref?: string | null;
  fromCode?: string | null;
  fromName?: string | null;
  fromTime?: string | null;
  fromDate?: string | null;
  fromTerminal?: string | null;
  toCode?: string | null;
  toName?: string | null;
  toTime?: string | null;
  toDate?: string | null;
  toTerminal?: string | null;
  duration?: string | null;
  seats?: string | null;
  bag?: string | null;
  costAmount?: number | null;
  costCurrency?: string | null;
  attachmentName?: string | null;
  attachmentSize?: string | null;
};

// True when any field inside the collapsed "More details" block holds data, so
// edit mode can open the block instead of hiding the user's own values.
function hasExtras(v: Partial<TransportFormValues>): boolean {
  return Boolean(
    v.dayIdx != null ||
      v.duration ||
      v.seats ||
      v.bag ||
      v.costAmount != null ||
      v.attachmentName ||
      v.attachmentSize,
  );
}

type Props = {
  mode: 'add' | 'edit';
  action: (formData: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  initial?: Partial<TransportFormValues>;
  cancelHref?: string;
};

export function TransportForm({ mode, action, hidden, initial, cancelHref = '/' }: Props) {
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="" width={36} height={36} style={{ borderRadius: 8 }} />
          <h1>{isEdit ? 'Edit transport' : 'Add transport'}</h1>
        </div>

        <form action={action} className={baseStyles.form}>
          {/* Hidden inputs for tripId, bookingId, etc. */}
          {Object.entries(hidden ?? {}).map(([k, val]) => (
            <input key={k} type="hidden" name={k} value={val} />
          ))}

          {/* Row: type + provider */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="tf-type" className={baseStyles.label}>
                Type
              </label>
              <select
                id="tf-type"
                name="type"
                required
                defaultValue={v.type ?? 'flight'}
                className={`${baseStyles.input} ${placeStyles.select}`}
              >
                <option value="flight">Flight</option>
                <option value="train">Train</option>
                <option value="car">Car</option>
                <option value="ferry">Ferry</option>
              </select>
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="tf-provider" className={baseStyles.label}>
                Provider
              </label>
              <input
                id="tf-provider"
                name="provider"
                type="text"
                defaultValue={v.provider ?? ''}
                placeholder="Japan Airlines"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Title (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="tf-title" className={baseStyles.label}>
              Title
            </label>
            <input
              id="tf-title"
              name="title"
              type="text"
              required
              defaultValue={v.title ?? ''}
              placeholder="JL5 · Los Angeles → Tokyo"
              className={baseStyles.input}
            />
          </div>

          {/* Booking ref (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="tf-ref" className={baseStyles.label}>
              Booking ref
            </label>
            <input
              id="tf-ref"
              name="ref"
              type="text"
              defaultValue={v.ref ?? ''}
              placeholder="ABC123"
              className={baseStyles.input}
            />
          </div>

          <TransportFormRouteFields v={v} />

          {/* Optional fields tucked away so the form is not a 20-field wall.
              Opens by default in edit mode if any of these already hold data. */}
          <details className={styles.disclosure} open={isEdit && hasExtras(v)}>
            <summary className={styles.disclosureSummary}>
              More details
              <span className={styles.disclosureHint}>
                cost, seats, baggage, attachment
              </span>
              <svg
                className={styles.disclosureChevron}
                viewBox="0 0 12 8"
                fill="none"
                aria-hidden
              >
                <path
                  d="M1 1l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <div className={styles.disclosureBody}>
              <div className={baseStyles.field}>
                <label htmlFor="tf-dayIdx" className={baseStyles.label}>
                  Trip day
                </label>
                <input
                  id="tf-dayIdx"
                  name="dayIdx"
                  type="number"
                  min="0"
                  defaultValue={v.dayIdx ?? ''}
                  placeholder="0"
                  className={baseStyles.input}
                />
              </div>

              <TransportFormMetaFields v={v} />
            </div>
          </details>

          {/* Actions row */}
          <div className={baseStyles.row} style={{ marginTop: 8 }}>
            <Link href={cancelHref} className={baseStyles.cancelBtn}>
              Cancel
            </Link>
            <SubmitButton className={signInStyles.btn} pendingText={<span>Saving…</span>}>
              <span>{isEdit ? 'Save changes' : 'Add transport'}</span>
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
