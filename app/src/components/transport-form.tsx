// TransportForm — server component used by both add-transport and edit-transport flows.
// The `action` prop is a server action supplied by the caller; no client JS here.

import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import baseStyles from './trip-create-form.module.css';
import styles from './place-form.module.css';

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
          <svg viewBox="0 0 32 32" fill="currentColor" width="36" height="36" aria-hidden>
            <path d="M16 3.2c-3.4 0-5.5 2-7.6 2-2.2 0-4.6-1.9-6.6.5C-.6 8.5.4 14.6 3.6 19.7c1.6 2.5 3.7 5.3 6.5 5.2 2.6-.1 3.6-1.7 6.7-1.7 3.1 0 4 1.7 6.7 1.6 2.8-.1 4.6-2.6 6.3-5.1 1.9-2.9 2.7-5.7 2.7-5.9-.1 0-5.2-2-5.3-7.9 0-4.9 4-7.3 4.2-7.4-2.3-3.4-5.9-3.8-7.2-3.9-3.3-.3-6 1.9-7.5 1.9z" />
          </svg>
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
                className={`${baseStyles.input} ${styles.select}`}
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

          {/* Row: ref + dayIdx */}
          <div className={baseStyles.row}>
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
          </div>

          {/* ── From ─────────────────────────────────────────── */}
          <div className={baseStyles.field} style={{ marginTop: 6 }}>
            <span className={baseStyles.label} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              From
            </span>
          </div>

          {/* Row: fromCode + fromName */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="tf-fromCode" className={baseStyles.label}>
                Code
              </label>
              <input
                id="tf-fromCode"
                name="fromCode"
                type="text"
                defaultValue={v.fromCode ?? ''}
                placeholder="LAX"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="tf-fromName" className={baseStyles.label}>
                Station / Airport
              </label>
              <input
                id="tf-fromName"
                name="fromName"
                type="text"
                defaultValue={v.fromName ?? ''}
                placeholder="Los Angeles Intl"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Row: fromDate + fromTime */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="tf-fromDate" className={baseStyles.label}>
                Date
              </label>
              <input
                id="tf-fromDate"
                name="fromDate"
                type="date"
                defaultValue={v.fromDate ?? ''}
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="tf-fromTime" className={baseStyles.label}>
                Time
              </label>
              <input
                id="tf-fromTime"
                name="fromTime"
                type="text"
                defaultValue={v.fromTime ?? ''}
                placeholder="10:30 AM"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* fromTerminal (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="tf-fromTerminal" className={baseStyles.label}>
              Terminal / Platform
            </label>
            <input
              id="tf-fromTerminal"
              name="fromTerminal"
              type="text"
              defaultValue={v.fromTerminal ?? ''}
              placeholder="Terminal B"
              className={baseStyles.input}
            />
          </div>

          {/* ── To ───────────────────────────────────────────── */}
          <div className={baseStyles.field} style={{ marginTop: 6 }}>
            <span className={baseStyles.label} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              To
            </span>
          </div>

          {/* Row: toCode + toName */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="tf-toCode" className={baseStyles.label}>
                Code
              </label>
              <input
                id="tf-toCode"
                name="toCode"
                type="text"
                defaultValue={v.toCode ?? ''}
                placeholder="NRT"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="tf-toName" className={baseStyles.label}>
                Station / Airport
              </label>
              <input
                id="tf-toName"
                name="toName"
                type="text"
                defaultValue={v.toName ?? ''}
                placeholder="Tokyo Narita"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Row: toDate + toTime */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="tf-toDate" className={baseStyles.label}>
                Date
              </label>
              <input
                id="tf-toDate"
                name="toDate"
                type="date"
                defaultValue={v.toDate ?? ''}
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="tf-toTime" className={baseStyles.label}>
                Time
              </label>
              <input
                id="tf-toTime"
                name="toTime"
                type="text"
                defaultValue={v.toTime ?? ''}
                placeholder="3:05 PM"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* toTerminal (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="tf-toTerminal" className={baseStyles.label}>
              Terminal / Platform
            </label>
            <input
              id="tf-toTerminal"
              name="toTerminal"
              type="text"
              defaultValue={v.toTerminal ?? ''}
              placeholder="Terminal 1"
              className={baseStyles.input}
            />
          </div>

          {/* ── Details ──────────────────────────────────────── */}

          {/* Row: duration + seats */}
          <div className={baseStyles.row} style={{ marginTop: 6 }}>
            <div className={baseStyles.field}>
              <label htmlFor="tf-duration" className={baseStyles.label}>
                Duration
              </label>
              <input
                id="tf-duration"
                name="duration"
                type="text"
                defaultValue={v.duration ?? ''}
                placeholder="11h 35m"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="tf-seats" className={baseStyles.label}>
                Seats
              </label>
              <input
                id="tf-seats"
                name="seats"
                type="text"
                defaultValue={v.seats ?? ''}
                placeholder="14A, 14B"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Bag (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="tf-bag" className={baseStyles.label}>
              Baggage
            </label>
            <input
              id="tf-bag"
              name="bag"
              type="text"
              defaultValue={v.bag ?? ''}
              placeholder="2 × 23kg checked"
              className={baseStyles.input}
            />
          </div>

          {/* Row: costAmount + costCurrency */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="tf-costAmount" className={baseStyles.label}>
                Cost
              </label>
              <input
                id="tf-costAmount"
                name="costAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={v.costAmount ?? ''}
                placeholder="0.00"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="tf-costCurrency" className={baseStyles.label}>
                Currency
              </label>
              <input
                id="tf-costCurrency"
                name="costCurrency"
                type="text"
                defaultValue={v.costCurrency ?? 'USD'}
                placeholder="USD"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Row: attachmentName + attachmentSize */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="tf-attachmentName" className={baseStyles.label}>
                Attachment name
              </label>
              <input
                id="tf-attachmentName"
                name="attachmentName"
                type="text"
                defaultValue={v.attachmentName ?? ''}
                placeholder="boarding-pass.pdf"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="tf-attachmentSize" className={baseStyles.label}>
                Attachment size
              </label>
              <input
                id="tf-attachmentSize"
                name="attachmentSize"
                type="text"
                defaultValue={v.attachmentSize ?? ''}
                placeholder="124 KB"
                className={baseStyles.input}
              />
            </div>
          </div>

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
