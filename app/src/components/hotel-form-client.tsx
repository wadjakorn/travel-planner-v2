'use client';

// HotelFormClient — the intent-first Add/Edit hotel form (the "booking design",
// matching the transport form). Captures Hotel · Check-in · Check-out; derives
// nights live; tucks the rest into "Additional info". Submits values as named /
// hidden inputs to the caller-supplied server action (unchanged
// addHotelAction/updateHotelAction). Internal fields (dayIdx, thumb, attachment
// name/size) ride along as hidden passthroughs so edits don't drop them.

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import Link from 'next/link';
import { MapsProvider } from './maps-provider';
import { HotelPlacePicker, type HotelSelection } from './hotel-place-picker';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui';
import { ConfirmDialog } from './confirm-dialog';
import { useDirtyForm } from './use-dirty-form';
import { Bed, Close, Check } from '@/components/icons';
import { computeNights, nightsLabel } from '@/lib/hotel-compute';
import { tripDateBounds } from '@/lib/trip-date-bounds';
import { COMMON_CURRENCIES } from '@/lib/currency';
import { GOOGLE_MAPS_API_KEY } from '@/lib/maps-config';
import styles from './hotel-form.module.css';

// Imperative handle so an overlay host (BookingsView's Modal) can route its
// own close requests (Escape, backdrop click) through this form's dirty
// check — "every close path through requestClose" also covers the ones the
// form itself doesn't render a button for.
export type HotelFormHandle = { requestClose: (close: () => void) => void };

export type HotelInitial = {
  dayIdx?: number | null;
  name?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  placeIdExternal?: string | null;
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
  deleteAction?: (formData: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  initial?: HotelInitial;
  cancelHref?: string;
  // Trip date range — scopes the check-in/out pickers to the trip ±3 days and
  // defaults an empty check-in to a date inside the trip.
  tripStart?: string | null;
  // Currency the trip is tracked in — the default for the cost field, so a
  // hotel does not silently land in USD on a THB trip.
  tripCurrency?: string | null;
  tripEnd?: string | null;
  // Overlay mode: when supplied, Cancel is a button (not a Link to
  // cancelHref) and onDone fires once the submit/delete action resolves, so
  // the caller (a Modal host) can close itself. cancelHref keeps working
  // unchanged for the standalone routes that pass neither prop.
  onDone?: () => void;
  onCancel?: () => void;
};

/** "Mon, Apr 10" from a YYYY-MM-DD string, rendered in UTC to avoid drift. */
function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export const HotelFormClient = forwardRef<HotelFormHandle, Props>(function HotelFormClient(
  {
    mode,
    action,
    deleteAction,
    hidden,
    initial,
    cancelHref = '/',
    tripStart,
    tripEnd,
    tripCurrency,
    onDone,
    onCancel,
  }: Props,
  fref,
) {
  const v = initial ?? {};
  const isEdit = mode === 'edit';
  const bounds = tripDateBounds(tripStart, tripEnd);

  const { formRef, markClean, requestClose, confirmOpen, confirmDiscard, cancelDiscard } =
    useDirtyForm();
  useImperativeHandle(fref, () => ({ requestClose }), [requestClose]);

  // The Places picker fills its hidden fields asynchronously after mount; if
  // that lands after useDirtyForm's own mount snapshot, an untouched form
  // could read as dirty. Settle once more on the next tick so the snapshot
  // always includes whatever the picker prefilled.
  useEffect(() => {
    const id = window.setTimeout(markClean, 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(formData: FormData) {
    await action(formData);
    markClean();
    onDone?.();
  }

  async function submitDelete(formData: FormData) {
    if (!deleteAction) return;
    await deleteAction(formData);
    markClean();
    onDone?.();
  }

  // A fresh Places pick (sel) wins; otherwise fall back to stored values (edit).
  const [sel, setSel] = useState<HotelSelection | null>(null);
  const [manual, setManual] = useState(!GOOGLE_MAPS_API_KEY);
  const [manualName, setManualName] = useState(v.name ?? '');
  const [manualAddress, setManualAddress] = useState(v.address ?? '');

  const [checkInDate, setCheckInDate] = useState(v.checkInDate ?? (isEdit ? '' : bounds.fallback ?? ''));
  const [checkInTime, setCheckInTime] = useState(v.checkInTime ?? '');
  const [checkOutDate, setCheckOutDate] = useState(v.checkOutDate ?? '');
  const [checkOutTime, setCheckOutTime] = useState(v.checkOutTime ?? '');
  const [nightsOverride, setNightsOverride] = useState('');

  const [room, setRoom] = useState(v.room ?? '');
  const [guests, setGuests] = useState(v.guests != null ? String(v.guests) : '');
  const [ref, setRef] = useState(v.ref ?? '');
  const [cost, setCost] = useState(v.costAmount != null ? String(v.costAmount) : '');
  // Empty = "follows the trip currency", which is what a null column already
  // means everywhere else (lib/trip-currency). Defaulting the picker to the
  // trip's code instead would pin the row: every legacy booking opened and
  // saved for an unrelated edit would quietly stop following the trip, and
  // could drop out of the budget later on a currency switch the user was
  // never asked about.
  const [currency, setCurrency] = useState(v.costCurrency ?? '');
  const [cancellation, setCancellation] = useState(v.cancellation ?? '');
  const [contact, setContact] = useState(v.contact ?? '');
  const [notes, setNotes] = useState(v.notes ?? '');

  const hasExtras = Boolean(
    v.room || v.guests != null || v.ref || v.costAmount != null || v.cancellation || v.contact || v.notes || v.nights != null,
  );

  // Effective location: a fresh pick fully replaces name/address/coords; a
  // manual entry uses the typed values; an untouched edit keeps stored values.
  const effName = manual ? manualName : sel?.name ?? v.name ?? '';
  const effAddress = manual ? manualAddress : sel?.address ?? v.address ?? '';
  const effLat = manual ? v.lat ?? null : sel ? sel.lat : v.lat ?? null;
  const effLng = manual ? v.lng ?? null : sel ? sel.lng : v.lng ?? null;
  const effPlaceId = manual ? v.placeIdExternal ?? null : sel ? sel.placeId : v.placeIdExternal ?? null;

  // Nights: derived from the date span, with an optional manual override.
  const derivedNights = computeNights(checkInDate, checkOutDate);
  const overrideNum = nightsOverride.trim() !== '' ? Number(nightsOverride) : null;
  const effectiveNights =
    overrideNum != null && !Number.isNaN(overrideNum) ? overrideNum : derivedNights;

  const previewTitle = effName || 'Your stay';
  const previewRange =
    checkInDate && checkOutDate
      ? `${formatDay(checkInDate)} → ${formatDay(checkOutDate)}`
      : checkInDate
        ? `Check-in ${formatDay(checkInDate)}`
        : null;

  return (
    <MapsProvider>
      <div className={styles.wrap} data-in-overlay={onDone ? '' : undefined}>
        <div className={styles.panel}>
          <form ref={formRef} action={onDone ? submit : action} className={styles.formShell}>
            {Object.entries(hidden ?? {}).map(([k, val]) => (
              <input key={k} type="hidden" name={k} value={val} />
            ))}
            {/* Derived + passthrough hidden fields the redesigned UI computes. */}
            <input type="hidden" name="name" value={effName} />
            <input type="hidden" name="address" value={effAddress} />
            <input type="hidden" name="lat" value={effLat ?? ''} />
            <input type="hidden" name="lng" value={effLng ?? ''} />
            <input type="hidden" name="placeIdExternal" value={effPlaceId ?? ''} />
            <input type="hidden" name="nights" value={effectiveNights ?? ''} />
            {/* Preserve internal fields the new UI doesn't expose. */}
            <input type="hidden" name="dayIdx" value={v.dayIdx ?? ''} />
            <input type="hidden" name="attachmentName" value={v.attachmentName ?? ''} />
            <input type="hidden" name="attachmentSize" value={v.attachmentSize ?? ''} />
            <input type="hidden" name="thumb" value={v.thumb ?? ''} />

            {/* Header */}
            <div className={styles.head}>
              <span className={styles.headIco} aria-hidden><Bed width={18} height={18} /></span>
              <h1 className={styles.headTitle}>{isEdit ? 'Edit hotel' : 'Add hotel'}</h1>
              {onCancel ? (
                <button
                  type="button"
                  onClick={() => requestClose(onCancel)}
                  className={styles.headX}
                  aria-label="Cancel"
                >
                  <Close width={16} height={16} />
                </button>
              ) : (
                <Link href={cancelHref} className={styles.headX} aria-label="Cancel">
                  <Close width={16} height={16} />
                </Link>
              )}
            </div>

            {/* Scroll body */}
            <div className={styles.body}>
              {/* Hotel */}
              <div className={styles.group}>
                <p className={styles.lbl}>Hotel</p>
                {manual ? (
                  <>
                    <input
                      className={styles.pickerInput}
                      style={{ paddingLeft: 14 }}
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Hotel name"
                      aria-label="Hotel name"
                    />
                    <div style={{ marginTop: 8 }}>
                      <input
                        className={styles.pickerInput}
                        style={{ paddingLeft: 14 }}
                        value={manualAddress}
                        onChange={(e) => setManualAddress(e.target.value)}
                        placeholder="Address"
                        aria-label="Hotel address"
                      />
                    </div>
                    {GOOGLE_MAPS_API_KEY && (
                      <button
                        type="button"
                        className={styles.delBtn}
                        style={{ color: 'var(--muted)', marginTop: 6 }}
                        onClick={() => setManual(false)}
                      >
                        Search hotels instead
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <HotelPlacePicker
                      placeholder="Search hotels…"
                      initial={v.name ? { name: v.name, address: v.address } : null}
                      onChange={setSel}
                    />
                    <button
                      type="button"
                      className={styles.delBtn}
                      style={{ color: 'var(--muted)', marginTop: 6 }}
                      onClick={() => {
                        setManualName(effName);
                        setManualAddress(effAddress);
                        setManual(true);
                      }}
                    >
                      Enter manually instead
                    </button>
                  </>
                )}
              </div>

              {/* Check-in */}
              <div className={styles.group}>
                <p className={styles.lbl}>Check-in</p>
                <div className={styles.row2}>
                  <label className={styles.fieldSm}>
                    <span className={styles.fl}>Date</span>
                    <input
                      type="date"
                      name="checkInDate"
                      value={checkInDate}
                      min={bounds.min}
                      max={bounds.max}
                      onChange={(e) => setCheckInDate(e.target.value)}
                    />
                  </label>
                  <label className={styles.fieldSm}>
                    <span className={styles.fl}>Time</span>
                    <input
                      type="time"
                      name="checkInTime"
                      value={checkInTime}
                      onChange={(e) => setCheckInTime(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              {/* Nights connector */}
              <div className={styles.connector} aria-hidden>
                <span className={styles.connLine} />
                {effectiveNights != null ? (
                  <span className={styles.connNights}>{nightsLabel(effectiveNights)}</span>
                ) : (
                  <span className={styles.connMuted}>Set check-out to see nights</span>
                )}
              </div>

              {/* Check-out */}
              <div className={styles.group}>
                <p className={styles.lbl}>Check-out</p>
                <div className={styles.row2}>
                  <label className={styles.fieldSm}>
                    <span className={styles.fl}>Date</span>
                    <input
                      type="date"
                      name="checkOutDate"
                      value={checkOutDate}
                      min={checkInDate || bounds.min}
                      max={bounds.max}
                      onChange={(e) => setCheckOutDate(e.target.value)}
                    />
                  </label>
                  <label className={styles.fieldSm}>
                    <span className={styles.fl}>Time</span>
                    <input
                      type="time"
                      name="checkOutTime"
                      value={checkOutTime}
                      onChange={(e) => setCheckOutTime(e.target.value)}
                    />
                  </label>
                </div>
              </div>

              {/* Computed preview */}
              <div className={styles.preview}>
                <div className={styles.previewKey}>
                  <Check width={12} height={12} /> Auto-filled for you
                </div>
                <div className={styles.previewTitle}>{previewTitle}</div>
                <div className={styles.previewArr}>
                  {previewRange ? (
                    <>
                      {effectiveNights != null && <b>{nightsLabel(effectiveNights)} · </b>}
                      <b>{previewRange}</b>
                    </>
                  ) : (
                    <span className={styles.previewMuted}>
                      Dates appear here once you set check-in and check-out
                    </span>
                  )}
                </div>
              </div>

              {/* Additional info */}
              <details className={styles.more} open={isEdit && hasExtras}>
                <summary className={styles.moreSummary}>
                  Additional info <span className={styles.moreHint}>room, guests, cost, ref, notes</span>
                  <svg className={styles.moreChev} viewBox="0 0 12 8" width="12" height="8" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M1 1l5 5 5-5" /></svg>
                </summary>
                <div className={styles.moreBody}>
                  <div className={styles.moreRow}>
                    <label className={styles.moreField}>
                      <span className={styles.moreFl}>Room</span>
                      <input className={styles.moreInput} name="room" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="King · Floor 31" />
                    </label>
                    <label className={styles.moreField}>
                      <span className={styles.moreFl}>Guests</span>
                      <input className={styles.moreInput} name="guests" value={guests} onChange={(e) => setGuests(e.target.value)} type="number" min={1} inputMode="numeric" placeholder="2" />
                    </label>
                  </div>
                  <div className={styles.moreRow}>
                    <label className={styles.moreField}>
                      <span className={styles.moreFl}>Cost</span>
                      <input className={styles.moreInput} name="costAmount" value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="450.00" />
                    </label>
                    <label className={styles.moreField}>
                      <span className={styles.moreFl}>Currency</span>
                      <select className={styles.moreInput} name="costCurrency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                        <option value="">{tripCurrency ? `${tripCurrency} · trip currency` : 'Trip currency'}</option>
                        {[...new Set([...COMMON_CURRENCIES, ...(currency ? [currency] : [])])].map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className={styles.moreRow}>
                    <label className={styles.moreField}>
                      <span className={styles.moreFl}>Booking ref</span>
                      <input className={styles.moreInput} name="ref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="ABC123" />
                    </label>
                    <label className={styles.moreField}>
                      <span className={styles.moreFl}>Nights override</span>
                      <input
                        className={styles.moreInput}
                        value={nightsOverride}
                        onChange={(e) => setNightsOverride(e.target.value)}
                        type="number"
                        min={0}
                        inputMode="numeric"
                        placeholder={derivedNights != null ? String(derivedNights) : 'auto'}
                      />
                    </label>
                  </div>
                  <label className={styles.moreField}>
                    <span className={styles.moreFl}>Cancellation policy</span>
                    <input className={styles.moreInput} name="cancellation" value={cancellation} onChange={(e) => setCancellation(e.target.value)} placeholder="Free cancellation before Apr 10" />
                  </label>
                  <label className={styles.moreField}>
                    <span className={styles.moreFl}>Contact</span>
                    <input className={styles.moreInput} name="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="+81 3-5322-1234" />
                  </label>
                  <label className={styles.moreField}>
                    <span className={styles.moreFl}>Notes</span>
                    <textarea className={styles.moreTextarea} name="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes…" />
                  </label>
                </div>
              </details>

            </div>

            {/* Footer */}
            <div className={styles.foot}>
              {isEdit && deleteAction && (
                <SubmitButton
                  formAction={onDone ? submitDelete : deleteAction}
                  formNoValidate
                  variant="ghost"
                  className={styles.footDelete}
                >
                  Delete hotel
                </SubmitButton>
              )}
              <span className={styles.footSpacer} />
              {onCancel ? (
                <Button
                  type="button"
                  variant="ghost"
                  className={styles.footCancel}
                  onClick={() => requestClose(onCancel)}
                >
                  Cancel
                </Button>
              ) : (
                <Button asChild variant="ghost" className={styles.footCancel}>
                  <Link href={cancelHref}>Cancel</Link>
                </Button>
              )}
              <SubmitButton variant="primary" className={styles.footPrimary} pendingText={<span>Saving…</span>}>
                <span>{isEdit ? 'Save changes' : 'Add hotel'}</span>
              </SubmitButton>
            </div>
          </form>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Discard changes?"
        message="You have unsaved changes to this hotel. Discard them?"
        confirmLabel="Discard"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </MapsProvider>
  );
});
