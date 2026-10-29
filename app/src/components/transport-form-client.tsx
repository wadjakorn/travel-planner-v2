'use client';

// TransportFormClient — the intent-first Add/Edit transport form. Captures
// Type · From · To · Depart · Duration; computes title + timezone-aware arrival
// live; tucks the rest into "Additional info". Submits derived values as hidden
// inputs to the caller-supplied server action (unchanged addTransport/updateTransport).

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { TransportPlacePicker, type PlaceSelection } from './transport-place-picker';
import { transportNear } from '@/lib/places/bias-center';
import { SubmitButton } from '@/components/submit-button';
import { Button } from '@/components/ui';
import { ConfirmDialog } from './confirm-dialog';
import { useDirtyForm } from './use-dirty-form';
import { Plane, Train, Boat, Car, Close, Check } from '@/components/icons';
import {
  computeTitle,
  computeArrival,
  arrivalBadge,
  shortPlaceLabel,
} from '@/lib/transport-compute';
import { tripDateBounds } from '@/lib/trip-date-bounds';
import { COMMON_CURRENCIES } from '@/lib/currency';
import { useT } from '@/components/i18n-provider';
import type { MessageKey } from '@/lib/i18n-client';
import styles from './transport-form.module.css';

// Imperative handle so an overlay host (BookingsView's Modal) can route its
// own close requests (Escape, backdrop click) through this form's dirty
// check.
export type TransportFormHandle = { requestClose: (close: () => void) => void };

type TransportType = 'flight' | 'train' | 'car' | 'ferry';

export type TransportInitial = {
  type?: TransportType;
  ref?: string | null;
  provider?: string | null;
  fromCode?: string | null;
  fromName?: string | null;
  fromDate?: string | null;
  fromTime?: string | null;
  fromTerminal?: string | null;
  toCode?: string | null;
  toName?: string | null;
  toDate?: string | null;
  toTime?: string | null;
  toTerminal?: string | null;
  duration?: string | null;
  seats?: string | null;
  bag?: string | null;
  costAmount?: number | null;
  costCurrency?: string | null;
};

type Props = {
  mode: 'add' | 'edit';
  action: (formData: FormData) => Promise<void>;
  deleteAction?: (formData: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  initial?: TransportInitial;
  cancelHref?: string;
  // Trip date range — scopes the depart-date picker to the trip ±3 days and
  // defaults an empty depart date to a date inside the trip.
  tripStart?: string | null;
  tripEnd?: string | null;
  // Currency the trip is tracked in — the default for the cost field.
  tripCurrency?: string | null;
  // Overlay mode: when supplied, Cancel is a button (not a Link to
  // cancelHref) and onDone fires once the submit/delete action resolves.
  // cancelHref keeps working unchanged for the standalone routes.
  onDone?: () => void;
  onCancel?: () => void;
};

const TYPES: { key: TransportType; label: MessageKey; Icon: typeof Plane }[] = [
  { key: 'flight', label: 'ride_type_flight', Icon: Plane },
  { key: 'train', label: 'ride_type_train', Icon: Train },
  { key: 'ferry', label: 'ride_type_ferry', Icon: Boat },
  { key: 'car', label: 'ride_type_car', Icon: Car },
];

// Example values: codes and a car model, the same in every language.
const REF_EXAMPLE = 'JL5 · 3XK9Q2';
const VEHICLE_EXAMPLE = 'Toyota Alphard';
const SEAT_EXAMPLE = '14A';
const FROM_CODE_EXAMPLE = 'LAX';
const TO_CODE_EXAMPLE = 'NRT';

/** Parse "11h 20m" / "1h" / "45m" into hours + minutes. */
function parseDuration(s: string | null | undefined): { h: number; m: number } {
  if (!s) return { h: 0, m: 0 };
  const h = s.match(/(\d+)\s*h/i);
  const m = s.match(/(\d+)\s*m/i);
  return { h: h ? Number(h[1]) : 0, m: m ? Number(m[1]) : 0 };
}
function formatDuration(h: number, m: number): string {
  return [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : ''].filter(Boolean).join(' ') || '0m';
}

export const TransportFormClient = forwardRef<TransportFormHandle, Props>(function TransportFormClient(
  { mode, action, deleteAction, hidden, initial, cancelHref = '/', tripStart, tripEnd, tripCurrency, onDone, onCancel }: Props,
  fref,
) {
  const t = useT();
  const v = initial ?? {};
  const isEdit = mode === 'edit';
  const initDur = parseDuration(v.duration);
  const dateBounds = tripDateBounds(tripStart, tripEnd);

  const { formRef, markClean, requestClose, confirmOpen, confirmDiscard, cancelDiscard } =
    useDirtyForm();
  useImperativeHandle(fref, () => ({ requestClose }), [requestClose]);

  // The From/To place pickers fill their hidden fields asynchronously after
  // mount; settle once more on the next tick so an untouched edit never
  // reads as dirty from a snapshot that predates the prefill.
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

  // Inline Delete asks for confirmation the same way the ticket's own Delete
  // does (bookings-view.tsx). Keep the button as a real submit control
  // (formAction intact) so the no-JS path still posts straight to the
  // server action; the click just intercepts once to show ConfirmDialog,
  // then re-submits for real via requestSubmit with itself as submitter.
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null);
  const bypassDeleteConfirm = useRef(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  function handleDeleteClick(e: React.MouseEvent<HTMLButtonElement>) {
    deleteButtonRef.current = e.currentTarget;
    if (bypassDeleteConfirm.current) {
      bypassDeleteConfirm.current = false;
      return;
    }
    e.preventDefault();
    setConfirmDeleteOpen(true);
  }

  function confirmDeleteBooking() {
    setConfirmDeleteOpen(false);
    const btn = deleteButtonRef.current;
    if (btn?.form) {
      bypassDeleteConfirm.current = true;
      btn.form.requestSubmit(btn);
    }
  }

  const [type, setType] = useState<TransportType>(v.type ?? 'flight');
  const [from, setFrom] = useState<PlaceSelection | null>(null);
  const [to, setTo] = useState<PlaceSelection | null>(null);
  const [fromBusy, setFromBusy] = useState(false);
  const [toBusy, setToBusy] = useState(false);
  const [departDate, setDepartDate] = useState(v.fromDate ?? (isEdit ? '' : dateBounds.fallback ?? ''));
  const [departTime, setDepartTime] = useState(v.fromTime ?? '');
  const [durH, setDurH] = useState(initDur.h);
  const [durM, setDurM] = useState(initDur.m);
  const [ref, setRef] = useState(v.ref ?? '');
  const [cost, setCost] = useState(v.costAmount != null ? String(v.costAmount) : '');
  // Empty = "follows the trip currency", which is what a null column already
  // means everywhere else (lib/trip-currency). Defaulting the picker to the
  // trip's code instead would pin the row: every legacy booking opened and
  // saved for an unrelated edit would quietly stop following the trip, and
  // could drop out of the budget later on a currency switch the user was
  // never asked about.
  const [currency, setCurrency] = useState(v.costCurrency ?? '');
  const [seats, setSeats] = useState(v.seats ?? '');
  const [bag, setBag] = useState(v.bag ?? '');

  const isCar = type === 'car';
  const hasExtras = Boolean(v.ref || v.provider || v.seats || v.bag || v.costAmount != null);

  // Effective endpoint fields: a fresh pick wins, else the stored value (edit).
  const fromName = from?.name ?? v.fromName ?? null;
  const fromCode = from?.code ?? v.fromCode ?? null;
  const toName = to?.name ?? v.toName ?? null;
  const toCode = to?.code ?? v.toCode ?? null;

  const durationMinutes = durH * 60 + durM;
  const initDurationMinutes = initDur.h * 60 + initDur.m;
  const fromLabel = fromName ? shortPlaceLabel(fromName) || fromCode : null;
  const toLabel = toName ? shortPlaceLabel(toName) || toCode : null;
  const title = computeTitle(type, ref, fromLabel, toLabel);

  // Did the user change what determines arrival (departure or duration)?
  const arrivalInputsChanged =
    departDate !== (v.fromDate ?? '') ||
    departTime !== (v.fromTime ?? '') ||
    durationMinutes !== initDurationMinutes;

  // Timezone-accurate arrival — needs both places' UTC offsets (fresh picks).
  const arrival = useMemo(
    () =>
      computeArrival({
        departDate,
        departTime,
        durationMinutes,
        fromOffsetMinutes: from?.utcOffsetMinutes ?? null,
        toOffsetMinutes: to?.utcOffsetMinutes ?? null,
      }),
    [departDate, departTime, durationMinutes, from, to],
  );
  // Fallback with no timezone shift, used only when the user changed the
  // departure/duration but we have no offsets (e.g. editing an existing ride
  // without re-selecting the places). Prevents saving a changed duration while
  // the arrival stays at the old stored value.
  const arrivalFallback = useMemo(
    () =>
      computeArrival({
        departDate,
        departTime,
        durationMinutes,
        fromOffsetMinutes: 0,
        toOffsetMinutes: 0,
      }),
    [departDate, departTime, durationMinutes],
  );
  const effectiveArrival = arrival ?? (arrivalInputsChanged ? arrivalFallback : null);

  // Arrival to submit: the effective computed one, else the stored value (an
  // untouched edit keeps its original timezone-correct arrival).
  const toDate = effectiveArrival?.date ?? v.toDate ?? '';
  const toTime = effectiveArrival?.time ?? v.toTime ?? '';
  const badge = arrivalBadge(effectiveArrival, t);

  const arrivalDisplay = effectiveArrival
    ? `${new Date(`${effectiveArrival.date}T00:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      })}, ${effectiveArrival.time}`
    : v.toDate
      ? `${v.toDate}${v.toTime ? ` · ${v.toTime}` : ''}`
      : null;

  // One sentence; split around {arrival} so the arrival can be bold.
  const [arrivesBefore, arrivesAfter = ''] = t('ride_preview_arrives').split('{arrival}');

  function step(setter: (n: number) => void, val: number, delta: number, max: number, wrap = false) {
    let next = val + delta;
    if (wrap) next = (next + (max + 1)) % (max + 1);
    else next = Math.max(0, Math.min(max, next));
    setter(next);
  }

  return (
    <>
      <div className={styles.wrap} data-in-overlay={onDone ? '' : undefined}>
      <div className={styles.panel}>
        <form ref={formRef} action={onDone ? submit : action} className={styles.formShell}>
          {Object.entries(hidden ?? {}).map(([k, val]) => (
            <input key={k} type="hidden" name={k} value={val} />
          ))}
          {/* Derived + passthrough hidden fields the redesigned UI computes. */}
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="title" value={title} />
          <input type="hidden" name="fromName" value={fromName ?? ''} />
          <input type="hidden" name="fromCode" value={fromCode ?? ''} />
          <input type="hidden" name="fromDate" value={departDate} />
          <input type="hidden" name="fromTime" value={departTime} />
          <input type="hidden" name="toName" value={toName ?? ''} />
          <input type="hidden" name="toCode" value={toCode ?? ''} />
          <input type="hidden" name="toDate" value={toDate} />
          <input type="hidden" name="toTime" value={toTime} />
          <input type="hidden" name="duration" value={durationMinutes > 0 ? formatDuration(durH, durM) : ''} />
          <input type="hidden" name="ref" value={ref} />
          <input type="hidden" name="costAmount" value={cost} />
          <input type="hidden" name="seats" value={seats} />
          <input type="hidden" name="bag" value={bag} />
          {/* Preserve fields the new UI doesn't expose. */}
          <input type="hidden" name="provider" value={v.provider ?? ''} />
          <input type="hidden" name="fromTerminal" value={v.fromTerminal ?? ''} />
          <input type="hidden" name="toTerminal" value={v.toTerminal ?? ''} />

          {/* Header */}
          <div className={styles.head}>
            <span className={styles.headIco} aria-hidden><Plane width={18} height={18} /></span>
            <h1 className={styles.headTitle}>{isEdit ? t('ride_edit_title') : t('ride_add_title')}</h1>
            {onCancel ? (
              <button
                type="button"
                onClick={() => requestClose(onCancel)}
                className={styles.headX}
                aria-label={t('cancel')}
              >
                <Close width={16} height={16} />
              </button>
            ) : (
              <Link href={cancelHref} className={styles.headX} aria-label={t('cancel')}>
                <Close width={16} height={16} />
              </Link>
            )}
          </div>

          {/* Scroll body */}
          <div className={styles.body}>
            {/* Type */}
            <div className={styles.group}>
              <div className={styles.types} role="group" aria-label={t('ride_type_aria')}>
                {TYPES.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={styles.type}
                    aria-pressed={type === key}
                    onClick={() => setType(key)}
                  >
                    <Icon width={19} height={19} />
                    {t(label)}
                  </button>
                ))}
              </div>
            </div>

            {/* From */}
            <div className={styles.group}>
              <p className={styles.lbl}>{t('ride_from_label')}</p>
              <TransportPlacePicker
                placeholder={t('ride_code_placeholder', { code: FROM_CODE_EXAMPLE })}
                initial={v.fromName ? { name: v.fromName, code: v.fromCode } : null}
                onChange={setFrom}
                onBusyChange={setFromBusy}
                near={transportNear(to)}
              />
              <div className={styles.row2}>
                <label className={styles.fieldSm}>
                  <span className={styles.fl}>{t('ride_depart_date_label')}</span>
                  <input type="date" value={departDate} min={dateBounds.min} max={dateBounds.max} onChange={(e) => setDepartDate(e.target.value)} />
                </label>
                <label className={styles.fieldSm}>
                  <span className={styles.fl}>{t('ride_depart_time_label')}</span>
                  <input type="time" value={departTime} onChange={(e) => setDepartTime(e.target.value)} />
                </label>
              </div>
            </div>

            <div className={styles.connector} aria-hidden>
              <span className={styles.connLine} />
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
            </div>

            {/* To */}
            <div className={styles.group}>
              <p className={styles.lbl}>{t('ride_to_label')}</p>
              <TransportPlacePicker
                placeholder={t('ride_code_placeholder', { code: TO_CODE_EXAMPLE })}
                initial={v.toName ? { name: v.toName, code: v.toCode } : null}
                onChange={setTo}
                onBusyChange={setToBusy}
                near={transportNear(from)}
              />
            </div>

            {/* Duration */}
            <div className={styles.group}>
              <p className={styles.lbl}>{t('ride_duration_label')}</p>
              <div className={styles.dur}>
                <div className={styles.stepper}>
                  <button type="button" onClick={() => step(setDurH, durH, -1, 48)} aria-label={t('ride_fewer_hours_aria')}>−</button>
                  <span className={styles.stepVal}>{durH}</span>
                  <span className={styles.stepU}>{t('ride_hours_unit')}</span>
                  <button type="button" onClick={() => step(setDurH, durH, 1, 48)} aria-label={t('ride_more_hours_aria')}>+</button>
                </div>
                <div className={styles.stepper}>
                  <button type="button" onClick={() => step(setDurM, durM, -5, 55, true)} aria-label={t('ride_fewer_minutes_aria')}>−</button>
                  <span className={styles.stepVal}>{durM}</span>
                  <span className={styles.stepU}>{t('ride_minutes_unit')}</span>
                  <button type="button" onClick={() => step(setDurM, durM, 5, 55, true)} aria-label={t('ride_more_minutes_aria')}>+</button>
                </div>
              </div>
            </div>

            {/* Computed preview */}
            <div className={styles.preview}>
              <div className={styles.previewKey}>
                <Check width={12} height={12} /> {t('booking_autofilled')}
              </div>
              <div className={styles.previewTitle}>{title}</div>
              <div className={styles.previewArr}>
                {arrivalDisplay ? (
                  <>
                    {arrivesBefore}
                    <b>{toLabel ? `${toLabel} · ` : ''}{arrivalDisplay}</b>
                    {arrivesAfter}
                    {badge && <span className={styles.previewTz}>{badge}</span>}
                  </>
                ) : (
                  <span className={styles.previewMuted}>{t('ride_preview_empty')}</span>
                )}
              </div>
            </div>

            {/* Additional info */}
            <details className={styles.more} open={isEdit && hasExtras}>
              <summary className={styles.moreSummary}>
                {t('booking_additional_info')}{' '}
                <span className={styles.moreHint}>{t('ride_additional_hint')}</span>
                <svg className={styles.moreChev} viewBox="0 0 12 8" width="12" height="8" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M1 1l5 5 5-5" /></svg>
              </summary>
              <div className={styles.moreBody}>
                <label className={styles.moreField}>
                  <span className={styles.moreFl}>{t('booking_ref_label')}</span>
                  <input className={styles.moreInput} value={ref} onChange={(e) => setRef(e.target.value)} placeholder={REF_EXAMPLE} />
                </label>
                <div className={styles.moreRow}>
                  <label className={styles.moreField}>
                    <span className={styles.moreFl}>{t('booking_cost_label')}</span>
                    <input className={styles.moreInput} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="450.00" />
                  </label>
                  <label className={styles.moreField}>
                    <span className={styles.moreFl}>{t('booking_currency_label')}</span>
                    <select className={styles.moreInput} name="costCurrency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                      <option value="">{tripCurrency ? t('booking_trip_currency_named', { code: tripCurrency }) : t('booking_trip_currency')}</option>
                      {[...new Set([...COMMON_CURRENCIES, ...(currency ? [currency] : [])])].map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={styles.moreRow}>
                  <label className={styles.moreField}>
                    <span className={styles.moreFl}>{isCar ? t('ride_vehicle_label') : t('ride_seat_cabin_label')}</span>
                    <input className={styles.moreInput} value={seats} onChange={(e) => setSeats(e.target.value)} placeholder={isCar ? VEHICLE_EXAMPLE : SEAT_EXAMPLE} />
                  </label>
                  <label className={styles.moreField}>
                    <span className={styles.moreFl}>{t('ride_baggage_label')}</span>
                    <input className={styles.moreInput} value={bag} onChange={(e) => setBag(e.target.value)} placeholder={t('ride_baggage_placeholder')} />
                  </label>
                </div>
              </div>
            </details>

          </div>

          {/* Footer */}
          <div className={styles.foot}>
            {isEdit && deleteAction && (
              <SubmitButton
                formAction={onDone ? submitDelete : deleteAction}
                formNoValidate
                variant="dangerQuiet"
                className={styles.footDelete}
                onClick={handleDeleteClick}
              >
                {t('ride_delete_label')}
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
                {t('cancel')}
              </Button>
            ) : (
              <Button asChild variant="ghost" className={styles.footCancel}>
                <Link href={cancelHref}>{t('cancel')}</Link>
              </Button>
            )}
            <SubmitButton variant="primary" className={styles.footPrimary} disabled={fromBusy || toBusy}>
              <span>{isEdit ? t('booking_save_changes') : t('ride_add_title')}</span>
            </SubmitButton>
          </div>
        </form>
      </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title={t('booking_discard_title')}
        message={t('ride_discard_body')}
        confirmLabel={t('booking_discard_confirm')}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={t('ride_delete_confirm_title')}
        message={t('booking_delete_confirm_body', { name: title })}
        confirmLabel={t('delete')}
        onConfirm={confirmDeleteBooking}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </>
  );
});
