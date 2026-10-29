'use client';

// Minimal manual entry form. Required fields: kind, name, category, lat/lng.
// Location comes from LocationField (coords/link, map centre, or a tap). Other
// fields left null/empty — user can refine later via the regular edit page.

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import baseStyles from './trip-create-form.module.css';
import styles from './place-form.module.css';
import { LocationField } from './location-field';
import { Button } from '@/components/ui';

const LOCATION_REQUIRED = 'Set a location: paste coordinates, use the map center, or tap the map.';

type Kind = 'hotel' | 'food' | 'sight' | 'transit';

const CATEGORIES: Record<Kind, string[]> = {
  hotel: ['Hotel', 'Resort', 'Hostel', 'Ryokan', 'Apartment', 'Guesthouse'],
  food: ['Restaurant', 'Cafe', 'Bar', 'Bakery', 'Street Food', 'Dessert'],
  sight: [
    'Attraction',
    'Park',
    'Museum',
    'Temple',
    'Shrine',
    'Viewpoint',
    'Beach',
    'Garden',
  ],
  transit: [
    'Train Station',
    'Bus Station',
    'Airport',
    'Subway Station',
    'Pier',
  ],
};

type Props = {
  dayId: string;
  tripId: string;
  action: (formData: FormData) => Promise<void>;
  initialCenter?: { lat: number; lng: number };
  variant?: 'page' | 'modal';
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function PlaceManualForm({
  dayId,
  tripId,
  action,
  initialCenter,
  variant = 'page',
  onSuccess,
  onCancel,
}: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('sight');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);

  function pick(p: { lat: number; lng: number }) {
    setPos(p);
    setLocationError(null);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pos) {
      setLocationError(LOCATION_REQUIRED);
      locationInputRef.current?.focus();
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set('lat', String(pos.lat));
    fd.set('lng', String(pos.lng));
    setSubmitting(true);
    setError(null);
    try {
      await action(fd);
      if (variant === 'modal') {
        onSuccess?.();
        router.refresh();
      } else {
        router.push(`/trip/${tripId}`);
        router.refresh();
      }
    } catch (err) {
      const digest = (err as { digest?: string } | null)?.digest ?? '';
      const msg = err instanceof Error ? err.message : '';
      const isRedirect =
        digest.startsWith('NEXT_REDIRECT') || msg.includes('NEXT_REDIRECT');
      if (!isRedirect) {
        setError("Couldn't add place. Try again.");
        setSubmitting(false);
      }
    }
  }

  const center = initialCenter ?? { lat: 35.6812, lng: 139.7671 }; // Tokyo
  const cats = CATEGORIES[kind];

  const formInner = (
        <form onSubmit={onSubmit} className={baseStyles.form}>
          <input type="hidden" name="dayId" value={dayId} />

          <div className={baseStyles.row}>
            <div className={baseStyles.field}>
              <label htmlFor="pf-kind" className={baseStyles.label}>
                Kind
              </label>
              <select
                id="pf-kind"
                name="kind"
                required
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className={`${baseStyles.input} ${styles.select}`}
              >
                <option value="hotel">Stay</option>
                <option value="food">Food</option>
                <option value="sight">Sight</option>
                <option value="transit">Transit</option>
              </select>
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="pf-category" className={baseStyles.label}>
                Category
              </label>
              <select
                id="pf-category"
                name="category"
                required
                defaultValue=""
                key={kind}
                className={`${baseStyles.input} ${styles.select}`}
              >
                <option value="" disabled>
                  Choose…
                </option>
                {cats.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={baseStyles.field}>
            <label htmlFor="pf-name" className={baseStyles.label}>
              Name
            </label>
            <input
              id="pf-name"
              name="name"
              type="text"
              required
              autoComplete="off"
              placeholder="What is this place called?"
              className={baseStyles.input}
            />
          </div>

          <LocationField
            value={pos}
            onChange={pick}
            center={center}
            mapHeight={300}
            error={locationError}
            inputRef={locationInputRef}
          />

          {error ? (
            <div role="alert" className="py-1 text-[13px] text-danger">
              {error}
            </div>
          ) : null}

          <div className={baseStyles.row} style={{ marginTop: 8 }}>
            {variant === 'modal' ? (
              <button
                type="button"
                onClick={onCancel}
                className={baseStyles.cancelBtn}
              >
                Cancel
              </button>
            ) : (
              <Link href={`/trip/${tripId}`} className={baseStyles.cancelBtn}>
                Cancel
              </Link>
            )}
            <Button
              type="submit"
              loading={submitting}
              disabled={submitting}
              className={signInStyles.btn}
            >
              Add place
            </Button>
          </div>
        </form>
  );

  if (variant === 'modal') {
    return (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px', color: '#1d1d1f' }}>
          Add place — manual
        </h2>
        {formInner}
      </div>
    );
  }

  return (
    <div className={signInStyles.wrap}>
      <div className={signInStyles.bg} aria-hidden>
        <div className={`${signInStyles.blob} ${signInStyles.b1}`} />
        <div className={`${signInStyles.blob} ${signInStyles.b2}`} />
        <div className={`${signInStyles.blob} ${signInStyles.b3}`} />
      </div>

      <div className={`${signInStyles.card} ${styles.card}`}>
        <div className={signInStyles.brand}>
          <h1>Add place — manual</h1>
        </div>
        {formInner}
      </div>
    </div>
  );
}
