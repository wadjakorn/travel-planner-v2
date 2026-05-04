// HotelForm — server component used by both add-hotel and edit-hotel flows.
// The `action` prop is a server action supplied by the caller; no client JS here.

import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import baseStyles from './trip-create-form.module.css';
import styles from './place-form.module.css';

type HotelFormValues = {
  dayIdx?: number | null;
  name: string;
  address?: string | null;
  checkInDate?: string | null;
  checkInTime?: string | null;
  checkOutDate?: string | null;
  checkOutTime?: string | null;
  nights?: number | null;
  room?: string | null;
  guests?: number | null;
  ref?: string | null;
  costAmount?: number | null;
  costCurrency?: string | null;
  cancellation?: string | null;
  contact?: string | null;
  notes?: string | null;
  attachmentName?: string | null;
  attachmentSize?: string | null;
  thumb?: string | null;
};

type Props = {
  mode: 'add' | 'edit';
  action: (formData: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  initial?: Partial<HotelFormValues>;
  cancelHref?: string;
};

export function HotelForm({ mode, action, hidden, initial, cancelHref = '/' }: Props) {
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
          <h1>{isEdit ? 'Edit hotel' : 'Add hotel'}</h1>
        </div>

        <form action={action} className={baseStyles.form}>
          {/* Hidden inputs (tripId, bookingId, etc.) */}
          {Object.entries(hidden ?? {}).map(([k, val]) => (
            <input key={k} type="hidden" name={k} value={val} />
          ))}

          {/* Name (full width, required) */}
          <div className={baseStyles.field}>
            <label htmlFor="hf-name" className={baseStyles.label}>
              Hotel name
            </label>
            <input
              id="hf-name"
              name="name"
              type="text"
              required
              defaultValue={v.name ?? ''}
              placeholder="Park Hyatt Tokyo"
              className={baseStyles.input}
            />
          </div>

          {/* Address (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="hf-address" className={baseStyles.label}>
              Address
            </label>
            <input
              id="hf-address"
              name="address"
              type="text"
              defaultValue={v.address ?? ''}
              placeholder="3-7-1-2 Nishi-Shinjuku, Shinjuku"
              className={baseStyles.input}
            />
          </div>

          {/* Row: check-in date + check-in time */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="hf-checkInDate" className={baseStyles.label}>
                Check-in date
              </label>
              <input
                id="hf-checkInDate"
                name="checkInDate"
                type="date"
                defaultValue={v.checkInDate ?? ''}
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="hf-checkInTime" className={baseStyles.label}>
                Check-in time
              </label>
              <input
                id="hf-checkInTime"
                name="checkInTime"
                type="text"
                defaultValue={v.checkInTime ?? ''}
                placeholder="3:00 PM"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Row: check-out date + check-out time */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="hf-checkOutDate" className={baseStyles.label}>
                Check-out date
              </label>
              <input
                id="hf-checkOutDate"
                name="checkOutDate"
                type="date"
                defaultValue={v.checkOutDate ?? ''}
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="hf-checkOutTime" className={baseStyles.label}>
                Check-out time
              </label>
              <input
                id="hf-checkOutTime"
                name="checkOutTime"
                type="text"
                defaultValue={v.checkOutTime ?? ''}
                placeholder="12:00 PM"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Row: nights + guests */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="hf-nights" className={baseStyles.label}>
                Nights
              </label>
              <input
                id="hf-nights"
                name="nights"
                type="number"
                min={0}
                defaultValue={v.nights ?? ''}
                placeholder="2"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="hf-guests" className={baseStyles.label}>
                Guests
              </label>
              <input
                id="hf-guests"
                name="guests"
                type="number"
                min={1}
                defaultValue={v.guests ?? ''}
                placeholder="2"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Room (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="hf-room" className={baseStyles.label}>
              Room
            </label>
            <input
              id="hf-room"
              name="room"
              type="text"
              defaultValue={v.room ?? ''}
              placeholder="King · Floor 31"
              className={baseStyles.input}
            />
          </div>

          {/* Booking ref (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="hf-ref" className={baseStyles.label}>
              Booking reference
            </label>
            <input
              id="hf-ref"
              name="ref"
              type="text"
              defaultValue={v.ref ?? ''}
              placeholder="ABC123"
              className={baseStyles.input}
            />
          </div>

          {/* Row: cost amount + currency */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="hf-costAmount" className={baseStyles.label}>
                Cost
              </label>
              <input
                id="hf-costAmount"
                name="costAmount"
                type="number"
                min={0}
                step={0.01}
                defaultValue={v.costAmount ?? ''}
                placeholder="450.00"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="hf-costCurrency" className={baseStyles.label}>
                Currency
              </label>
              <input
                id="hf-costCurrency"
                name="costCurrency"
                type="text"
                defaultValue={v.costCurrency ?? 'USD'}
                placeholder="USD"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Cancellation policy (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="hf-cancellation" className={baseStyles.label}>
              Cancellation policy
            </label>
            <input
              id="hf-cancellation"
              name="cancellation"
              type="text"
              defaultValue={v.cancellation ?? ''}
              placeholder="Free cancellation before Apr 10"
              className={baseStyles.input}
            />
          </div>

          {/* Contact (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="hf-contact" className={baseStyles.label}>
              Contact
            </label>
            <input
              id="hf-contact"
              name="contact"
              type="text"
              defaultValue={v.contact ?? ''}
              placeholder="+81 3-5322-1234"
              className={baseStyles.input}
            />
          </div>

          {/* Notes (full width, textarea) */}
          <div className={baseStyles.field}>
            <label htmlFor="hf-notes" className={baseStyles.label}>
              Notes
            </label>
            <textarea
              id="hf-notes"
              name="notes"
              rows={3}
              defaultValue={v.notes ?? ''}
              placeholder="Any notes…"
              className={`${baseStyles.input} ${styles.textarea}`}
            />
          </div>

          {/* Row: attachment name + attachment size */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="hf-attachmentName" className={baseStyles.label}>
                Attachment name
              </label>
              <input
                id="hf-attachmentName"
                name="attachmentName"
                type="text"
                defaultValue={v.attachmentName ?? ''}
                placeholder="confirmation.pdf"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="hf-attachmentSize" className={baseStyles.label}>
                Attachment size
              </label>
              <input
                id="hf-attachmentSize"
                name="attachmentSize"
                type="text"
                defaultValue={v.attachmentSize ?? ''}
                placeholder="245 KB"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Thumb (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="hf-thumb" className={baseStyles.label}>
              Thumbnail
            </label>
            <input
              id="hf-thumb"
              name="thumb"
              type="text"
              defaultValue={v.thumb ?? ''}
              placeholder="#hex colour or image URL"
              className={baseStyles.input}
            />
          </div>

          {/* Day index (full width, optional) */}
          <div className={baseStyles.field}>
            <label htmlFor="hf-dayIdx" className={baseStyles.label}>
              Day index
            </label>
            <input
              id="hf-dayIdx"
              name="dayIdx"
              type="number"
              min={0}
              defaultValue={v.dayIdx ?? ''}
              placeholder="0-based day index this stay attaches to"
              className={baseStyles.input}
            />
          </div>

          {/* Actions row */}
          <div className={baseStyles.row} style={{ marginTop: 8 }}>
            <Link href={cancelHref} className={baseStyles.cancelBtn}>
              Cancel
            </Link>
            <SubmitButton className={signInStyles.btn} pendingText={<span>Saving…</span>}>
              <span>{isEdit ? 'Save changes' : 'Add hotel'}</span>
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
