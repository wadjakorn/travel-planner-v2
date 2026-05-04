'use client';

// HotelsView — client component.
// Renders hotel booking cards + manages add/edit/delete busy overlays.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { HotelBooking } from '@/db/schema';
import { Note, Phone, GMaps, External, Trash } from '@/components/icons';
import { Spinner } from './spinner';
import { HotelSearchPicker } from './hotel-search-picker';
import { HotelEditLauncher } from './hotel-edit-launcher';
import styles from './hotels-view.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  tripId: string;
  hotels: HotelBooking[]; // pre-filtered by tripId + non-deleted, sorted checkInDate ASC
  removeAction: (formData: FormData) => Promise<void>;
  addAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  canEdit?: boolean;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a deterministic pastel background from a hotel name for thumbs with no image. */
function pastelFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 40%, 80%)`;
}

/** Format a cost amount as $N,NNN — no decimals when whole number. */
function formatCost(amount: number | null | undefined, currency = 'USD'): string {
  if (amount == null) return '';
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : `${currency} `;
  return `${symbol}${Math.round(amount).toLocaleString('en-US')}`;
}

/** Compute nights from check-in/check-out (date-only diff). */
function computeNights(ci: string | null, co: string | null): number {
  if (!ci || !co) return 0;
  const a = Date.parse(ci);
  const b = Date.parse(co);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  const diff = Math.round((b - a) / 86400000);
  return diff > 0 ? diff : 0;
}

/** Compute IDs of hotels whose date ranges overlap any other hotel.
 *  Half-open [checkIn, checkOut): checkout day free for next hotel. */
function overlappingHotelIds(hotels: HotelBooking[]): Set<string> {
  const out = new Set<string>();
  const valid = hotels
    .filter((h) => h.checkInDate && h.checkOutDate)
    .map((h) => ({ id: h.id, ci: h.checkInDate as string, co: h.checkOutDate as string }));
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      const a = valid[i];
      const b = valid[j];
      if (a.ci < b.co && b.ci < a.co) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}

/** Pick the most common non-null currency among bookings, fall back to USD. */
function dominantCurrency(hotels: HotelBooking[]): string {
  const counts: Record<string, number> = {};
  for (const h of hotels) {
    if (h.costCurrency) counts[h.costCurrency] = (counts[h.costCurrency] ?? 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return 'USD';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HotelsView({
  tripId,
  hotels,
  removeAction,
  addAction,
  updateAction,
  canEdit = true,
}: Props) {
  const currency = dominantCurrency(hotels);
  const total = hotels.reduce((s, h) => s + (h.costAmount ?? 0), 0);
  const totalNights = hotels.reduce((s, h) => s + computeNights(h.checkInDate, h.checkOutDate), 0);
  const overlapIds = overlappingHotelIds(hotels);
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  function handleDelete(e: React.FormEvent<HTMLFormElement>, id: string) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusyId(id);
    startDelete(async () => {
      try {
        await removeAction(fd);
        router.refresh();
      } finally {
        setBusyId(null);
      }
    });
  }

  return (
    <div className={styles.wrap}>
      {/* ── Header ── */}
      <header className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Stays</div>
          <h1 className={styles.title}>Hotels</h1>
          <div className={styles.meta}>
            <span className={styles.badge}>{hotels.length} {hotels.length === 1 ? 'hotel' : 'hotels'}</span>
            {totalNights > 0 && (
              <span className={styles.total}>{totalNights} {totalNights === 1 ? 'night' : 'nights'}</span>
            )}
            {total > 0 && (
              <span className={styles.total}>{formatCost(total, currency)} total</span>
            )}
          </div>
        </div>
      </header>

      {canEdit ? (
        <HotelSearchPicker tripId={tripId} addAction={addAction} onBusyChange={setAdding} />
      ) : null}

      {adding && (
        <div className={styles.pageOverlay} role="status" aria-live="polite">
          <Spinner size={28} />
          <span>Adding hotel…</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {hotels.length === 0 && (
        <div className={styles.empty}>
          <span>No hotel bookings yet.</span>
          {canEdit ? (
            <p>Use the search above to add your first stay.</p>
          ) : null}
        </div>
      )}

      {/* ── Card grid ── */}
      {hotels.length > 0 && (
        <div className={styles.grid}>
          {hotels.map((h) => {
            const thumbBg = h.thumb ?? pastelFromName(h.name);
            const nights = computeNights(h.checkInDate, h.checkOutDate);

            const cardBusy = busyId === h.id;
            return (
              <article key={h.id} className={styles.card} aria-busy={cardBusy || undefined}>
                {/* ── Thumb stripe ── */}
                <div className={styles.thumb} style={{ background: thumbBg }}>
                  <svg viewBox="0 0 80 80" width="80" height="80" aria-hidden="true">
                    <rect x="14" y="34" width="52" height="38" fill="rgba(255,255,255,0.55)" />
                    <rect x="20" y="42" width="8" height="8" fill="rgba(255,255,255,0.8)" />
                    <rect x="32" y="42" width="8" height="8" fill="rgba(255,255,255,0.8)" />
                    <rect x="44" y="42" width="8" height="8" fill="rgba(255,255,255,0.8)" />
                    <rect x="20" y="54" width="8" height="8" fill="rgba(255,255,255,0.8)" />
                    <rect x="32" y="54" width="8" height="8" fill="rgba(255,255,255,0.8)" />
                    <rect x="44" y="54" width="8" height="8" fill="rgba(255,255,255,0.8)" />
                  </svg>
                </div>

                {/* ── Card body ── */}
                <div className={styles.body}>
                  {overlapIds.has(h.id) && (
                    <div className={styles.overlapWarn} role="status">
                      ⚠ Dates overlap with another hotel
                    </div>
                  )}
                  {/* Top row: name + cost */}
                  <div className={styles.top}>
                    <div className={styles.titleBlock}>
                      <h3 className={styles.name}>{h.name}</h3>
                      {h.address && <div className={styles.address}>{h.address}</div>}
                      {nights > 0 && (
                        <div className={styles.nightsPill}>
                          {nights} {nights === 1 ? 'night' : 'nights'}
                        </div>
                      )}
                    </div>
                    {h.costAmount != null && (
                      <div className={styles.cost}>
                        <div className={styles.amount}>{formatCost(h.costAmount, h.costCurrency ?? 'USD')}</div>
                        {nights > 0 && (
                          <div className={styles.costSub}>{nights} {nights === 1 ? 'night' : 'nights'}</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Stay strip */}
                  {(h.checkInDate || h.checkOutDate) && (
                    <div className={styles.stayStrip}>
                      <div className={styles.stayCol}>
                        <div className={styles.label}>Check-in</div>
                        {h.checkInDate && <div className={styles.stayDate}>{h.checkInDate}</div>}
                        {h.checkInTime && <div className={styles.stayTime}>{h.checkInTime}</div>}
                      </div>
                      <div className={styles.stayArrow} aria-hidden="true">
                        <svg viewBox="0 0 80 24" width="80" height="24">
                          <line x1="4" y1="12" x2="72" y2="12" stroke="#c7c7cc" strokeWidth="1" strokeDasharray="3 3" />
                          <path d="M70 8 L76 12 L70 16 Z" fill="#c7c7cc" />
                          {nights > 0 && (
                            <text x="40" y="9" textAnchor="middle" fontSize="9" fill="#86868b">{nights}n</text>
                          )}
                        </svg>
                      </div>
                      <div className={styles.stayCol}>
                        <div className={styles.label}>Check-out</div>
                        {h.checkOutDate && <div className={styles.stayDate}>{h.checkOutDate}</div>}
                        {h.checkOutTime && <div className={styles.stayTime}>{h.checkOutTime}</div>}
                      </div>
                    </div>
                  )}

                  {/* Info grid */}
                  <div className={styles.infoGrid}>
                    {h.room && (
                      <div className={styles.line}>
                        <span className={styles.lineLabel}>Room</span>
                        <span className={styles.lineValue}>{h.room}</span>
                      </div>
                    )}
                    {h.guests != null && (
                      <div className={styles.line}>
                        <span className={styles.lineLabel}>Guests</span>
                        <span className={styles.lineValue}>{h.guests}</span>
                      </div>
                    )}
                    {h.ref && (
                      <div className={styles.line}>
                        <span className={styles.lineLabel}>Confirmation</span>
                        <span className={styles.lineValueMono}>{h.ref}</span>
                      </div>
                    )}
                    {h.cancellation && (
                      <div className={styles.line}>
                        <span className={styles.lineLabel}>Cancellation</span>
                        <span className={styles.lineValue}>{h.cancellation}</span>
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  {h.notes && (
                    <div className={styles.notes}>
                      <Note aria-hidden="true" />
                      <span>{h.notes}</span>
                    </div>
                  )}

                  {/* Footer: attachment + ghost actions */}
                  <div className={styles.foot}>
                    {h.attachmentName && (
                      <span className={styles.attach}>
                        <span className={styles.attachIco}>PDF</span>
                        <span className={styles.attachName}>{h.attachmentName}</span>
                        {h.attachmentSize && (
                          <span className={styles.attachSize}>{h.attachmentSize}</span>
                        )}
                      </span>
                    )}
                    <span className={styles.spacer} />
                    {h.contact && (
                      <a className={styles.ghostBtn} href={`tel:${h.contact}`}>
                        <Phone aria-hidden="true" /> Call
                      </a>
                    )}
                    {h.address && (
                      <a
                        className={styles.ghostBtn}
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${h.name}, ${h.address}`)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <GMaps aria-hidden="true" /> Map
                      </a>
                    )}
                    <button className={styles.ghostBtn} type="button">
                      <External aria-hidden="true" /> View
                    </button>
                    {canEdit ? (
                      <>
                        <HotelEditLauncher
                          action={updateAction}
                          onBusyChange={(b) => setBusyId((prev) => (b ? h.id : prev === h.id ? null : prev))}
                          initial={{
                            bookingId: h.id,
                            name: h.name,
                            address: h.address,
                            lat: h.lat,
                            lng: h.lng,
                            placeIdExternal: h.placeIdExternal,
                            checkInDate: h.checkInDate,
                            checkInTime: h.checkInTime,
                            checkOutDate: h.checkOutDate,
                            checkOutTime: h.checkOutTime,
                          }}
                        />
                        <form onSubmit={(e) => handleDelete(e, h.id)}>
                          <input type="hidden" name="bookingId" value={h.id} />
                          <button type="submit" className={styles.deleteBtn} aria-label={`Delete ${h.name}`} disabled={cardBusy}>
                            <Trash aria-hidden="true" />
                          </button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </div>
                {cardBusy && (
                  <div className={styles.cardOverlay} aria-hidden="true">
                    <Spinner size={24} />
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
