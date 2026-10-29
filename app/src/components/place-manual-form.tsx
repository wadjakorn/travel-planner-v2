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
import { useT } from '@/components/i18n-provider';
import type { MessageKey } from '@/lib/i18n-client';

type Kind = 'hotel' | 'food' | 'sight' | 'transit';

// [stored value, label key]: the category is saved in English (user data,
// i18n Decision 4); only the option label is translated.
const CATEGORIES: Record<Kind, [string, MessageKey][]> = {
  hotel: [
    ['Hotel', 'place_cat_hotel'],
    ['Resort', 'place_cat_resort'],
    ['Hostel', 'place_cat_hostel'],
    ['Ryokan', 'place_cat_ryokan'],
    ['Apartment', 'place_cat_apartment'],
    ['Guesthouse', 'place_cat_guesthouse'],
  ],
  food: [
    ['Restaurant', 'place_cat_restaurant'],
    ['Cafe', 'place_cat_cafe'],
    ['Bar', 'place_cat_bar'],
    ['Bakery', 'place_cat_bakery'],
    ['Street Food', 'place_cat_street_food'],
    ['Dessert', 'place_cat_dessert'],
  ],
  sight: [
    ['Attraction', 'place_cat_attraction'],
    ['Park', 'place_cat_park'],
    ['Museum', 'place_cat_museum'],
    ['Temple', 'place_cat_temple'],
    ['Shrine', 'place_cat_shrine'],
    ['Viewpoint', 'place_cat_viewpoint'],
    ['Beach', 'place_cat_beach'],
    ['Garden', 'place_cat_garden'],
  ],
  transit: [
    ['Train Station', 'place_cat_train_station'],
    ['Bus Station', 'place_cat_bus_station'],
    ['Airport', 'place_cat_airport'],
    ['Subway Station', 'place_cat_subway_station'],
    ['Pier', 'place_cat_pier'],
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
  const t = useT();
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
      setLocationError(t('place_location_required'));
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
        setError(t('place_add_error'));
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
                {t('place_kind_label')}
              </label>
              <select
                id="pf-kind"
                name="kind"
                required
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className={`${baseStyles.input} ${styles.select}`}
              >
                <option value="hotel">{t('place_kind_hotel')}</option>
                <option value="food">{t('place_kind_food')}</option>
                <option value="sight">{t('place_kind_sight')}</option>
                <option value="transit">{t('place_kind_transit')}</option>
              </select>
            </div>

            <div className={baseStyles.field}>
              <label htmlFor="pf-category" className={baseStyles.label}>
                {t('place_category_label')}
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
                  {t('place_category_choose')}
                </option>
                {cats.map(([value, labelKey]) => (
                  <option key={value} value={value}>
                    {t(labelKey)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={baseStyles.field}>
            <label htmlFor="pf-name" className={baseStyles.label}>
              {t('place_name_label')}
            </label>
            <input
              id="pf-name"
              name="name"
              type="text"
              required
              autoComplete="off"
              placeholder={t('place_name_placeholder')}
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
                {t('cancel')}
              </button>
            ) : (
              <Link href={`/trip/${tripId}`} className={baseStyles.cancelBtn}>
                {t('cancel')}
              </Link>
            )}
            <Button
              type="submit"
              loading={submitting}
              disabled={submitting}
              className={signInStyles.btn}
            >
              {t('add_place')}
            </Button>
          </div>
        </form>
  );

  if (variant === 'modal') {
    return (
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px', color: '#1d1d1f' }}>
          {t('place_manual_title')}
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
          <h1>{t('place_manual_title')}</h1>
        </div>
        {formInner}
      </div>
    </div>
  );
}
