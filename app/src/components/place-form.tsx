// PlaceForm — server component used by both add-place and edit-place flows.
// The `action` prop is a server action supplied by the caller; no client JS here.

import Link from 'next/link';
import { SubmitButton } from '@/components/submit-button';
import { PlaceAutocomplete } from '@/components/place-autocomplete';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import baseStyles from './trip-create-form.module.css';
import styles from './place-form.module.css';

type PlaceKind = 'hotel' | 'food' | 'sight' | 'transit';

type PlaceFormValues = {
  kind: PlaceKind;
  name: string;
  category?: string | null;
  rating?: number | null;
  reviews?: number | null;
  time?: string | null;
  duration?: string | null;
  price?: string | null;
  address?: string | null;
  phone?: string | null;
  website?: string | null;
  hours?: string | null;
  tags?: string[] | null;
  thumb?: string | null;
  note?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeIdExternal?: string | null;
};

type Props = {
  mode: 'add' | 'edit';
  action: (formData: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  initial?: Partial<PlaceFormValues>;
  cancelHref?: string;
};

export function PlaceForm({ mode, action, hidden, initial, cancelHref = '/' }: Props) {
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
          <h1>{isEdit ? 'Edit place' : 'Add place'}</h1>
        </div>

        <form action={action} className={baseStyles.form}>
          {/* Hidden inputs for dayId, placeId, etc. */}
          {Object.entries(hidden ?? {}).map(([k, val]) => (
            <input key={k} type="hidden" name={k} value={val} />
          ))}

          {/* Row 1: kind + price */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="pf-kind" className={baseStyles.label}>
                Kind
              </label>
              <select
                id="pf-kind"
                name="kind"
                required
                defaultValue={v.kind ?? 'sight'}
                className={`${baseStyles.input} ${styles.select}`}
              >
                <option value="hotel">Hotel</option>
                <option value="food">Food</option>
                <option value="sight">Sight</option>
                <option value="transit">Transit</option>
              </select>
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="pf-price" className={baseStyles.label}>
                Price
              </label>
              <select
                id="pf-price"
                name="price"
                defaultValue={v.price ?? ''}
                className={`${baseStyles.input} ${styles.select}`}
              >
                <option value="">Any</option>
                <option value="Free">Free</option>
                <option value="$">$</option>
                <option value="$$">$$</option>
                <option value="$$$">$$$</option>
                <option value="$$$$">$$$$</option>
              </select>
            </div>
          </div>

          {/* Name (full width). PlaceAutocomplete renders the visible
              name input + hidden lat/lng/placeIdExternal/address fields
              when NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is set. Falls back to
              a plain <input name="name"/> otherwise. */}
          <div className={baseStyles.field}>
            <label htmlFor="pf-name" className={baseStyles.label}>
              Name
            </label>
            <PlaceAutocomplete
              defaultName={v.name ?? null}
              defaultAddress={v.address ?? null}
              defaultLat={v.lat ?? null}
              defaultLng={v.lng ?? null}
              defaultPlaceIdExternal={v.placeIdExternal ?? null}
              inputClassName={baseStyles.input}
            />
          </div>

          {/* Category (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="pf-category" className={baseStyles.label}>
              Category
            </label>
            <input
              id="pf-category"
              name="category"
              type="text"
              defaultValue={v.category ?? ''}
              placeholder="Park · 1h"
              className={baseStyles.input}
            />
          </div>

          {/* Row 2: time + duration */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="pf-time" className={baseStyles.label}>
                Time
              </label>
              <input
                id="pf-time"
                name="time"
                type="text"
                defaultValue={v.time ?? ''}
                placeholder="3:00 PM"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="pf-duration" className={baseStyles.label}>
                Duration
              </label>
              <input
                id="pf-duration"
                name="duration"
                type="text"
                defaultValue={v.duration ?? ''}
                placeholder="1h 30m"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Row 3: rating + reviews */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="pf-rating" className={baseStyles.label}>
                Rating
              </label>
              <input
                id="pf-rating"
                name="rating"
                type="number"
                step="0.1"
                min="0"
                max="5"
                defaultValue={v.rating ?? ''}
                placeholder="4.5"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="pf-reviews" className={baseStyles.label}>
                Reviews
              </label>
              <input
                id="pf-reviews"
                name="reviews"
                type="number"
                min="0"
                defaultValue={v.reviews ?? ''}
                placeholder="1200"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Address (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="pf-address" className={baseStyles.label}>
              Address
            </label>
            <input
              id="pf-address"
              name="address"
              type="text"
              defaultValue={v.address ?? ''}
              placeholder="2-3-1 Asakusa, Taito City"
              className={baseStyles.input}
            />
          </div>

          {/* Row 4: phone + website */}
          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="pf-phone" className={baseStyles.label}>
                Phone
              </label>
              <input
                id="pf-phone"
                name="phone"
                type="text"
                defaultValue={v.phone ?? ''}
                placeholder="+81 3-3844-0181"
                className={baseStyles.input}
              />
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="pf-website" className={baseStyles.label}>
                Website
              </label>
              <input
                id="pf-website"
                name="website"
                type="text"
                defaultValue={v.website ?? ''}
                placeholder="https://…"
                className={baseStyles.input}
              />
            </div>
          </div>

          {/* Hours (full width) */}
          <div className={baseStyles.field}>
            <label htmlFor="pf-hours" className={baseStyles.label}>
              Hours
            </label>
            <input
              id="pf-hours"
              name="hours"
              type="text"
              defaultValue={v.hours ?? ''}
              placeholder="6:00 AM – 5:00 PM"
              className={baseStyles.input}
            />
          </div>

          {/* Row 5: thumb (full width — hex is short, but single-col reads better) */}
          <div className={baseStyles.field}>
            <label htmlFor="pf-thumb" className={baseStyles.label}>
              Thumbnail
            </label>
            <input
              id="pf-thumb"
              name="thumb"
              type="text"
              defaultValue={v.thumb ?? ''}
              placeholder="#hex colour or image URL"
              className={baseStyles.input}
            />
          </div>

          {/* Tags (full width, comma-separated) */}
          <div className={baseStyles.field}>
            <label htmlFor="pf-tags" className={baseStyles.label}>
              Tags
            </label>
            <input
              id="pf-tags"
              name="tags"
              type="text"
              defaultValue={v.tags?.join(', ') ?? ''}
              placeholder="temple, historic, outdoor"
              className={baseStyles.input}
            />
            <span className={styles.hint}>Separate multiple tags with commas. The server will split them automatically.</span>
          </div>

          {/* Note (full width, textarea) */}
          <div className={baseStyles.field}>
            <label htmlFor="pf-note" className={baseStyles.label}>
              Note
            </label>
            <textarea
              id="pf-note"
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
              <span>{isEdit ? 'Save changes' : 'Add place'}</span>
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}
