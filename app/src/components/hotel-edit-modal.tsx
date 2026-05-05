'use client';

// Minimal hotel edit overlay. Search-sourced rows (placeIdExternal set):
// edit only check-in/out date+time. Manual rows: also edit name, address,
// and location (map pick).

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import baseStyles from './trip-create-form.module.css';
import signInStyles from '@/app/sign-in/sign-in.module.css';
import { GOOGLE_MAPS_API_KEY } from '@/lib/maps-config';

const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? '';

type Initial = {
  bookingId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeIdExternal: string | null;
  checkInDate: string | null;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
};

type Props = {
  initial: Initial;
  action: (fd: FormData) => Promise<void>;
  onClose: () => void;
  onBusyChange?: (busy: boolean) => void;
};

export function HotelEditModal({ initial, action, onClose, onBusyChange }: Props) {
  const router = useRouter();
  const isManual = !initial.placeIdExternal;

  const [name, setName] = useState(initial.name);
  const [address, setAddress] = useState(initial.address ?? '');
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(
    initial.lat != null && initial.lng != null
      ? { lat: initial.lat, lng: initial.lng }
      : null,
  );
  const [ci, setCi] = useState(initial.checkInDate ?? '');
  const [ct, setCt] = useState(initial.checkInTime ?? '15:00');
  const [co, setCo] = useState(initial.checkOutDate ?? '');
  const [cot, setCot] = useState(initial.checkOutTime ?? '11:00');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onMapClick = useCallback((e: MapMouseEvent) => {
    const ll = e.detail.latLng;
    if (ll) setPos({ lat: ll.lat, lng: ll.lng });
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ci || !co) {
      setError('Pick check-in and check-out dates.');
      return;
    }
    if (co < ci) {
      setError('Check-out must be on or after check-in.');
      return;
    }
    if (isManual && !pos) {
      setError('Tap the map to choose hotel location.');
      return;
    }
    if (isManual && !name.trim()) {
      setError('Hotel name required.');
      return;
    }
    const fd = new FormData();
    fd.set('bookingId', initial.bookingId);
    fd.set('checkInDate', ci);
    fd.set('checkInTime', ct);
    fd.set('checkOutDate', co);
    fd.set('checkOutTime', cot);
    if (isManual) {
      fd.set('name', name.trim());
      fd.set('address', address.trim());
      if (pos) {
        fd.set('lat', String(pos.lat));
        fd.set('lng', String(pos.lng));
      }
    }
    setSubmitting(true);
    setError(null);
    onBusyChange?.(true);
    try {
      await action(fd);
      onClose();
      router.refresh();
      // Clear busy after refresh tick so card overlay covers re-render.
      setTimeout(() => onBusyChange?.(false), 0);
    } catch (err) {
      const digest = (err as { digest?: string } | null)?.digest ?? '';
      const msg = err instanceof Error ? err.message : '';
      const isRedirect =
        digest.startsWith('NEXT_REDIRECT') || msg.includes('NEXT_REDIRECT');
      if (!isRedirect) {
        setError(msg || 'Failed to save');
        setSubmitting(false);
        onBusyChange?.(false);
      }
    }
  }

  const center = pos ?? { lat: 35.6812, lng: 139.7671 };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit hotel"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#fff',
          borderRadius: 16,
          maxWidth: 560,
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 4px', color: '#1d1d1f' }}>
          Edit hotel
        </h2>
        <div style={{ fontSize: 13, color: '#6e6e73', marginBottom: 16 }}>
          {isManual ? 'Manual entry — full edit' : 'From Google — dates only'}
        </div>

        <form onSubmit={onSubmit} className={baseStyles.form}>
          {isManual ? (
            <>
              <div className={baseStyles.field}>
                <label htmlFor="he-name" className={baseStyles.label}>Name</label>
                <input
                  id="he-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={baseStyles.input}
                />
              </div>
              <div className={baseStyles.field}>
                <label htmlFor="he-address" className={baseStyles.label}>Address</label>
                <input
                  id="he-address"
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={baseStyles.input}
                />
              </div>
            </>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className={baseStyles.field}>
              <label htmlFor="he-ci" className={baseStyles.label}>Check-in date</label>
              <input
                id="he-ci"
                type="date"
                required
                value={ci}
                onChange={(e) => setCi(e.target.value)}
                className={baseStyles.input}
              />
            </div>
            <div className={baseStyles.field}>
              <label htmlFor="he-ct" className={baseStyles.label}>Check-in time</label>
              <input
                id="he-ct"
                type="time"
                value={ct}
                onChange={(e) => setCt(e.target.value)}
                className={baseStyles.input}
              />
            </div>
            <div className={baseStyles.field}>
              <label htmlFor="he-co" className={baseStyles.label}>Check-out date</label>
              <input
                id="he-co"
                type="date"
                required
                value={co}
                onChange={(e) => setCo(e.target.value)}
                className={baseStyles.input}
              />
            </div>
            <div className={baseStyles.field}>
              <label htmlFor="he-cot" className={baseStyles.label}>Check-out time</label>
              <input
                id="he-cot"
                type="time"
                value={cot}
                onChange={(e) => setCot(e.target.value)}
                className={baseStyles.input}
              />
            </div>
          </div>

          {isManual ? (
            <div className={baseStyles.field}>
              <label className={baseStyles.label}>
                Location {pos ? '✓ — tap map to change' : '— tap the map'}
              </label>
              <div
                style={{
                  width: '100%',
                  height: 240,
                  borderRadius: 12,
                  overflow: 'hidden',
                  border: '1px solid rgb(228 228 231)',
                }}
              >
                {GOOGLE_MAPS_API_KEY ? (
                  <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
                    <Map
                      style={{ width: '100%', height: '100%' }}
                      defaultCenter={center}
                      defaultZoom={13}
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
                  </APIProvider>
                ) : (
                  <div style={{ padding: 16, color: '#86868b', fontSize: 13 }}>
                    Google Maps API key not set.
                  </div>
                )}
              </div>
              {pos ? (
                <span style={{ fontSize: 12, color: '#86868b' }}>
                  {pos.lat.toFixed(5)}, {pos.lng.toFixed(5)}
                </span>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div style={{ color: '#c8102e', fontSize: 13, padding: '4px 0' }}>{error}</div>
          ) : null}

          <div className={baseStyles.row} style={{ marginTop: 8 }}>
            <button type="button" onClick={onClose} className={baseStyles.cancelBtn}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className={signInStyles.btn}
            >
              {submitting ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
