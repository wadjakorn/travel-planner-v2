// HotelsView — server component.
// Read-only render of hotel booking cards.
// Edit/delete affordances accepted as props; no client state here.

import Link from 'next/link';
import type { HotelBooking } from '@/db/schema';
import { Plus, Note, Phone, GMaps, External, Edit, Trash } from '@/components/icons';
import styles from './hotels-view.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  tripId: string;
  hotels: HotelBooking[]; // pre-filtered by tripId + non-deleted, sorted checkInDate ASC
  editHrefBase: string; // e.g. `/trip/${tripId}/booking/hotel`
  removeAction: (formData: FormData) => Promise<void>;
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

export function HotelsView({ hotels, editHrefBase, removeAction }: Props) {
  const currency = dominantCurrency(hotels);
  const total = hotels.reduce((s, h) => s + (h.costAmount ?? 0), 0);
  const totalNights = hotels.reduce((s, h) => s + (h.nights ?? 0), 0);

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
        <Link href={`${editHrefBase}/new`} className={styles.addBtn}>
          <Plus />
          Add hotel
        </Link>
      </header>

      {/* ── Empty state ── */}
      {hotels.length === 0 && (
        <div className={styles.empty}>
          <span>No hotel bookings yet.</span>
          <p>Add your first stay to keep everything in one place.</p>
          <Link href={`${editHrefBase}/new`} className={styles.addBtn}>
            <Plus />
            Add hotel
          </Link>
        </div>
      )}

      {/* ── Card grid ── */}
      {hotels.length > 0 && (
        <div className={styles.grid}>
          {hotels.map((h) => {
            const thumbBg = h.thumb ?? pastelFromName(h.name);
            const nights = h.nights ?? 0;

            return (
              <article key={h.id} className={styles.card}>
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
                  {/* Top row: name + cost */}
                  <div className={styles.top}>
                    <div className={styles.titleBlock}>
                      <h3 className={styles.name}>{h.name}</h3>
                      {h.address && <div className={styles.address}>{h.address}</div>}
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
                  </div>
                </div>

                {/* ── Per-card hover actions ── */}
                <div className={styles.actions}>
                  <Link href={`${editHrefBase}/${h.id}/edit`} className={styles.editBtn}>
                    <Edit aria-hidden="true" /> Edit
                  </Link>
                  <form action={removeAction}>
                    <input type="hidden" name="bookingId" value={h.id} />
                    <button type="submit" className={styles.deleteBtn} aria-label={`Delete ${h.name}`}>
                      <Trash aria-hidden="true" />
                    </button>
                  </form>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
