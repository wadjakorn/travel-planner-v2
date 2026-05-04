'use client';

// Minimal manual entry form. Required fields: kind, name, category, lat/lng.
// Lat/lng picked by clicking on the map. Other fields left null/empty —
// user can refine later via the regular edit page.

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import baseStyles from './trip-create-form.module.css';
import styles from './place-form.module.css';

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

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
};

export function PlaceManualForm({
  dayId,
  tripId,
  action,
  initialCenter,
}: Props) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('sight');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onMapClick = useCallback((e: MapMouseEvent) => {
    const ll = e.detail.latLng;
    if (ll) setPos({ lat: ll.lat, lng: ll.lng });
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pos) {
      setError('Tap the map to choose a location.');
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set('lat', String(pos.lat));
    fd.set('lng', String(pos.lng));
    setSubmitting(true);
    setError(null);
    try {
      await action(fd);
      router.push(`/trip/${tripId}`);
      router.refresh();
    } catch (err) {
      const digest = (err as { digest?: string } | null)?.digest ?? '';
      const msg = err instanceof Error ? err.message : '';
      const isRedirect =
        digest.startsWith('NEXT_REDIRECT') || msg.includes('NEXT_REDIRECT');
      if (!isRedirect) {
        setError(msg || 'Failed to add place');
        setSubmitting(false);
      }
    }
  }

  const center = initialCenter ?? { lat: 35.6812, lng: 139.7671 }; // Tokyo
  const cats = CATEGORIES[kind];

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
                <option value="hotel">Hotel</option>
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

          <div className={baseStyles.field}>
            <label className={baseStyles.label}>
              Location {pos ? '✓' : '— tap the map'}
            </label>
            <div
              style={{
                width: '100%',
                height: 300,
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgb(228 228 231)',
              }}
            >
              {API_KEY ? (
                <APIProvider apiKey={API_KEY}>
                  <Map
                    style={{ width: '100%', height: '100%' }}
                    defaultCenter={center}
                    defaultZoom={12}
                    disableDefaultUI={false}
                    gestureHandling="greedy"
                    onClick={onMapClick}
                  >
                    {pos ? (
                      <AdvancedMarker position={pos}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background: '#0071e3',
                            border: '2px solid #fff',
                            boxShadow: '0 4px 12px rgba(0,113,227,0.5)',
                          }}
                        />
                      </AdvancedMarker>
                    ) : null}
                  </Map>
                </APIProvider>
              ) : (
                <div
                  style={{
                    padding: 16,
                    color: '#86868b',
                    fontSize: 13,
                  }}
                >
                  Google Maps API key not set — manual map disabled. Use the
                  search picker instead.
                </div>
              )}
            </div>
            {pos ? (
              <span className={styles.hint}>
                {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
              </span>
            ) : null}
          </div>

          {error ? (
            <div
              style={{
                color: '#c8102e',
                fontSize: 13,
                padding: '4px 0',
              }}
            >
              {error}
            </div>
          ) : null}

          <div className={baseStyles.row} style={{ marginTop: 8 }}>
            <Link href={`/trip/${tripId}`} className={baseStyles.cancelBtn}>
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting || !pos}
              className={signInStyles.btn}
            >
              {submitting ? 'Saving…' : 'Add place'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
