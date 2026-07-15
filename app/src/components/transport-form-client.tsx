'use client';

// TransportFormClient — the intent-first Add/Edit transport form. Captures
// Type · From · To · Depart · Duration; computes title + timezone-aware arrival
// live; tucks the rest into "Additional info". Submits derived values as hidden
// inputs to the caller-supplied server action (unchanged addTransport/updateTransport).

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MapsProvider } from './maps-provider';
import { TransportPlacePicker, type PlaceSelection } from './transport-place-picker';
import { SubmitButton } from '@/components/submit-button';
import { Plane, Train, Boat, Car, Close, Check } from '@/components/icons';
import {
  computeTitle,
  computeArrival,
  arrivalBadge,
  shortPlaceLabel,
} from '@/lib/transport-compute';
import { tripDateBounds } from '@/lib/trip-date-bounds';
import styles from './transport-form.module.css';

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
};

const TYPES: { key: TransportType; label: string; Icon: typeof Plane }[] = [
  { key: 'flight', label: 'Flight', Icon: Plane },
  { key: 'train', label: 'Train', Icon: Train },
  { key: 'ferry', label: 'Ferry', Icon: Boat },
  { key: 'car', label: 'Car', Icon: Car },
];

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

export function TransportFormClient({ mode, action, deleteAction, hidden, initial, cancelHref = '/', tripStart, tripEnd }: Props) {
  const v = initial ?? {};
  const isEdit = mode === 'edit';
  const initDur = parseDuration(v.duration);
  const dateBounds = tripDateBounds(tripStart, tripEnd);

  const [type, setType] = useState<TransportType>(v.type ?? 'flight');
  const [from, setFrom] = useState<PlaceSelection | null>(null);
  const [to, setTo] = useState<PlaceSelection | null>(null);
  const [departDate, setDepartDate] = useState(v.fromDate ?? (isEdit ? '' : dateBounds.fallback ?? ''));
  const [departTime, setDepartTime] = useState(v.fromTime ?? '');
  const [durH, setDurH] = useState(initDur.h);
  const [durM, setDurM] = useState(initDur.m);
  const [ref, setRef] = useState(v.ref ?? '');
  const [cost, setCost] = useState(v.costAmount != null ? String(v.costAmount) : '');
  const [seats, setSeats] = useState(v.seats ?? '');
  const [bag, setBag] = useState(v.bag ?? '');

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
  const badge = arrivalBadge(effectiveArrival);

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

  function step(setter: (n: number) => void, val: number, delta: number, max: number, wrap = false) {
    let next = val + delta;
    if (wrap) next = (next + (max + 1)) % (max + 1);
    else next = Math.max(0, Math.min(max, next));
    setter(next);
  }

  return (
    <MapsProvider>
      <div className={styles.wrap}>
      <div className={styles.panel}>
        <form action={action} className={styles.formShell}>
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
          <input type="hidden" name="costCurrency" value={v.costCurrency ?? ''} />
          <input type="hidden" name="seats" value={seats} />
          <input type="hidden" name="bag" value={bag} />
          {/* Preserve fields the new UI doesn't expose. */}
          <input type="hidden" name="provider" value={v.provider ?? ''} />
          <input type="hidden" name="fromTerminal" value={v.fromTerminal ?? ''} />
          <input type="hidden" name="toTerminal" value={v.toTerminal ?? ''} />

          {/* Header */}
          <div className={styles.head}>
            <span className={styles.headIco} aria-hidden><Plane width={18} height={18} /></span>
            <h1 className={styles.headTitle}>{isEdit ? 'Edit transport' : 'Add transport'}</h1>
            <Link href={cancelHref} className={styles.headX} aria-label="Cancel">
              <Close width={16} height={16} />
            </Link>
          </div>

          {/* Scroll body */}
          <div className={styles.body}>
            {/* Type */}
            <div className={styles.group}>
              <div className={styles.types} role="group" aria-label="Transport type">
                {TYPES.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={styles.type}
                    aria-pressed={type === key}
                    onClick={() => setType(key)}
                  >
                    <Icon width={19} height={19} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* From */}
            <div className={styles.group}>
              <p className={styles.lbl}>From</p>
              <TransportPlacePicker
                placeholder="Type a code (LAX) or place name"
                initial={v.fromName ? { name: v.fromName, code: v.fromCode } : null}
                onChange={setFrom}
              />
              <div className={styles.row2}>
                <label className={styles.fieldSm}>
                  <span className={styles.fl}>Depart date</span>
                  <input type="date" value={departDate} min={dateBounds.min} max={dateBounds.max} onChange={(e) => setDepartDate(e.target.value)} />
                </label>
                <label className={styles.fieldSm}>
                  <span className={styles.fl}>Depart time</span>
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
              <p className={styles.lbl}>To</p>
              <TransportPlacePicker
                placeholder="Type a code (NRT) or place name"
                initial={v.toName ? { name: v.toName, code: v.toCode } : null}
                onChange={setTo}
              />
            </div>

            {/* Duration */}
            <div className={styles.group}>
              <p className={styles.lbl}>How long?</p>
              <div className={styles.dur}>
                <div className={styles.stepper}>
                  <button type="button" onClick={() => step(setDurH, durH, -1, 48)} aria-label="Fewer hours">−</button>
                  <span className={styles.stepVal}>{durH}</span>
                  <span className={styles.stepU}>hr</span>
                  <button type="button" onClick={() => step(setDurH, durH, 1, 48)} aria-label="More hours">+</button>
                </div>
                <div className={styles.stepper}>
                  <button type="button" onClick={() => step(setDurM, durM, -5, 55, true)} aria-label="Fewer minutes">−</button>
                  <span className={styles.stepVal}>{durM}</span>
                  <span className={styles.stepU}>min</span>
                  <button type="button" onClick={() => step(setDurM, durM, 5, 55, true)} aria-label="More minutes">+</button>
                </div>
              </div>
            </div>

            {/* Computed preview */}
            <div className={styles.preview}>
              <div className={styles.previewKey}>
                <Check width={12} height={12} /> Auto-filled for you
              </div>
              <div className={styles.previewTitle}>{title}</div>
              <div className={styles.previewArr}>
                {arrivalDisplay ? (
                  <>
                    Arrives <b>{toLabel ? `${toLabel} · ` : ''}{arrivalDisplay}</b>
                    {badge && <span className={styles.previewTz}>{badge}</span>}
                  </>
                ) : (
                  <span className={styles.previewMuted}>Arrival appears once you set the destination and duration</span>
                )}
              </div>
            </div>

            {/* Additional info */}
            <details className={styles.more} open={isEdit && hasExtras}>
              <summary className={styles.moreSummary}>
                Additional info <span className={styles.moreHint}>code, cost, seat, baggage</span>
                <svg className={styles.moreChev} viewBox="0 0 12 8" width="12" height="8" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M1 1l5 5 5-5" /></svg>
              </summary>
              <div className={styles.moreBody}>
                <input className={styles.moreInput} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Booking ref (e.g. JL5 · 3XK9Q2)" />
                <input className={styles.moreInput} value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" placeholder="Cost (amount)" />
                <input className={styles.moreInput} value={seats} onChange={(e) => setSeats(e.target.value)} placeholder={type === 'car' ? 'Vehicle' : 'Seat / cabin'} />
                <input className={styles.moreInput} value={bag} onChange={(e) => setBag(e.target.value)} placeholder="Baggage" />
              </div>
            </details>

            {isEdit && deleteAction && (
              <div className={styles.delRow}>
                <button type="submit" formAction={deleteAction} formNoValidate className={styles.delBtn}>
                  Delete transport
                </button>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={styles.foot}>
            <Link href={cancelHref} className={styles.cancelBtn}>Cancel</Link>
            <SubmitButton className={styles.goBtn} pendingText={<span>Saving…</span>}>
              <span>{isEdit ? 'Save changes' : 'Add transport'}</span>
            </SubmitButton>
          </div>
        </form>
      </div>
      </div>
    </MapsProvider>
  );
}
