'use client';

// Minimal hotel manual entry: name, address, lat/lng (map pick).
// Used inside HotelSearchPicker overlay modal.

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Map,
  AdvancedMarker,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import baseStyles from './trip-create-form.module.css';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import { GOOGLE_MAPS_API_KEY } from '@/lib/maps-config';
import { MapsProvider } from './maps-provider';

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '';

type Props = {
  tripId: string;
  action: (formData: FormData) => Promise<void>;
  initialCenter?: { lat: number; lng: number };
  onSuccess?: () => void;
  onCancel?: () => void;
};

export function HotelManualForm({
  tripId,
  action,
  initialCenter,
  onSuccess,
  onCancel,
}: Props) {
  const router = useRouter();
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ci, setCi] = useState('');
  const [ct, setCt] = useState('15:00');
  const [co, setCo] = useState('');
  const [cot, setCot] = useState('11:00');

  const onMapClick = useCallback((e: MapMouseEvent) => {
    const ll = e.detail.latLng;
    if (ll) setPos({ lat: ll.lat, lng: ll.lng });
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!pos) {
      setError('Tap the map to choose hotel location.');
      return;
    }
    if (!ci || !co) {
      setError('Pick check-in and check-out dates.');
      return;
    }
    if (co < ci) {
      setError('Check-out must be on or after check-in.');
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set('tripId', tripId);
    fd.set('lat', String(pos.lat));
    fd.set('lng', String(pos.lng));
    fd.set('checkInDate', ci);
    fd.set('checkInTime', ct);
    fd.set('checkOutDate', co);
    fd.set('checkOutTime', cot);
    setSubmitting(true);
    setError(null);
    try {
      await action(fd);
      onSuccess?.();
      router.refresh();
    } catch (err) {
      const digest = (err as { digest?: string } | null)?.digest ?? '';
      const msg = err instanceof Error ? err.message : '';
      const isRedirect =
        digest.startsWith('NEXT_REDIRECT') || msg.includes('NEXT_REDIRECT');
      if (!isRedirect) {
        setError(msg || 'Failed to add hotel');
        setSubmitting(false);
      }
    }
  }

  const center = initialCenter ?? { lat: 35.6812, lng: 139.7671 };

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 16px', color: '#1d1d1f' }}>
        Add hotel — manual
      </h2>

      <form onSubmit={onSubmit} className={baseStyles.form}>
        <div className={baseStyles.field}>
          <label htmlFor="hf-name" className={baseStyles.label}>Name</label>
          <input
            id="hf-name"
            name="name"
            type="text"
            required
            autoComplete="off"
            placeholder="Hotel name"
            className={baseStyles.input}
          />
        </div>

        <div className={baseStyles.field}>
          <label htmlFor="hf-address" className={baseStyles.label}>Address</label>
          <input
            id="hf-address"
            name="address"
            type="text"
            autoComplete="off"
            placeholder="Street, city"
            className={baseStyles.input}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className={baseStyles.field}>
            <label htmlFor="hf-ci" className={baseStyles.label}>Check-in date</label>
            <input
              id="hf-ci"
              type="date"
              required
              value={ci}
              onChange={(e) => setCi(e.target.value)}
              className={baseStyles.input}
            />
          </div>
          <div className={baseStyles.field}>
            <label htmlFor="hf-ct" className={baseStyles.label}>Check-in time</label>
            <input
              id="hf-ct"
              type="time"
              value={ct}
              onChange={(e) => setCt(e.target.value)}
              className={baseStyles.input}
            />
          </div>
          <div className={baseStyles.field}>
            <label htmlFor="hf-co" className={baseStyles.label}>Check-out date</label>
            <input
              id="hf-co"
              type="date"
              required
              value={co}
              onChange={(e) => setCo(e.target.value)}
              className={baseStyles.input}
            />
          </div>
          <div className={baseStyles.field}>
            <label htmlFor="hf-cot" className={baseStyles.label}>Check-out time</label>
            <input
              id="hf-cot"
              type="time"
              value={cot}
              onChange={(e) => setCot(e.target.value)}
              className={baseStyles.input}
            />
          </div>
        </div>

        <div className={baseStyles.field}>
          <label className={baseStyles.label}>
            Location {pos ? '✓' : '— tap the map'}
          </label>
          <div
            style={{
              width: '100%',
              height: 280,
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid rgb(228 228 231)',
            }}
          >
            {GOOGLE_MAPS_API_KEY ? (
              <MapsProvider>
                <Map
                  style={{ width: '100%', height: '100%' }}
                  defaultCenter={center}
                  defaultZoom={12}
                  gestureHandling="greedy"
                  onClick={onMapClick}
                  {...(MAP_ID ? { mapId: MAP_ID } : {})}
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
              </MapsProvider>
            ) : (
              <div style={{ padding: 16, color: '#86868b', fontSize: 13 }}>
                Google Maps API key not set — manual map disabled.
              </div>
            )}
          </div>
          {pos ? (
            <span style={{ fontSize: 12, color: '#86868b' }}>
              {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
            </span>
          ) : null}
        </div>

        {error ? (
          <div style={{ color: '#c8102e', fontSize: 13, padding: '4px 0' }}>{error}</div>
        ) : null}

        <div className={baseStyles.row} style={{ marginTop: 8 }}>
          <button type="button" onClick={onCancel} className={baseStyles.cancelBtn}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !pos}
            className={signInStyles.btn}
          >
            {submitting ? 'Saving…' : 'Add hotel'}
          </button>
        </div>
      </form>
    </div>
  );
}
