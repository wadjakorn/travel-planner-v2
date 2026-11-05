'use client';

// Leg detail sheet (TP-0152): one leg between two stops — travel mode,
// approximate minutes and travel note — opened from the list's leg bar and the
// map's arcs through LegSheetProvider (leg-sheet-context.tsx). Holds a
// snapshot of the leg; the server checks it still exists on save.
// What it shows: lib/leg-sheet-fields.ts.

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input, Modal, Segmented, Textarea, buttonClasses } from '@/components/ui';
import { Close, Drive, NavArrow, Transit, Walk } from '@/components/icons';
import { ConfirmDialog } from './confirm-dialog';
import { useT } from '@/components/i18n-provider';
import { saveLegAction } from '@/app/actions/legs';
import { logActionFailure } from '@/lib/action-errors';
import { gmapsDirectionsUrl, travelMode } from '@/lib/gmaps';
import { ARRIVE_DURATION_MAX, ARRIVE_NOTE_MAX } from '@/lib/legs';
import { legSheetFields, parseDurationField } from '@/lib/leg-sheet-fields';
import { legStyle } from '@/lib/map-route';
import type { LegInfo } from '@/lib/leg-info';
import type { Mode } from '@/lib/map-helpers';
import type { MessageKey } from '@/lib/i18n-client';
import { formatDurationMin } from '@/lib/units';
import styles from './leg-sheet.module.css';

/** What the host needs to handle Back while the sheet is open. */
export type LegSheetBackHandle = {
  dirty: () => boolean;
  /** Shows the discard confirmation (confirming calls onClose). */
  askDiscard: () => void;
};

type Props = {
  info: LegInfo;
  readOnly: boolean;
  onClose: () => void;
  /** After a save; closes the sheet. Defaults to onClose. */
  onSaved?: () => void;
  registerBack?: (h: LegSheetBackHandle | null) => void;
};

const MODES: Mode[] = ['walk', 'drive', 'transit'];

const MODE_LABEL: Record<Mode, MessageKey> = {
  drive: 'itin_mode_drive',
  walk: 'itin_mode_walk',
  transit: 'itin_mode_transit',
};

function ModeIcon({ mode }: { mode: Mode }) {
  if (mode === 'walk') return <Walk aria-hidden />;
  if (mode === 'transit') return <Transit aria-hidden />;
  return <Drive aria-hidden />;
}

type SaveInput = Parameters<typeof saveLegAction>[0];

export function LegSheet({ info, readOnly, onClose, onSaved, registerBack }: Props) {
  const t = useT();
  const fields = legSheetFields(info, readOnly);
  const initialDuration = info.durationMin == null ? '' : String(info.durationMin);
  const initialNote = info.note ?? '';

  const [mode, setMode] = useState<Mode>(info.mode);
  const [durationText, setDurationText] = useState(initialDuration);
  // A number input reports '' for text it can't parse; remember that it isn't blank.
  const [durationBad, setDurationBad] = useState(false);
  const [durationError, setDurationError] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const durationRef = useRef<HTMLInputElement>(null);
  const ids = useId();

  const dirty =
    fields.editable &&
    (mode !== info.mode || durationText !== initialDuration || durationBad || note !== initialNote);

  // Back (leg-sheet-context.tsx) reads the latest values without re-registering.
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    if (!registerBack) return;
    registerBack({ dirty: () => dirtyRef.current, askDiscard: () => setConfirmDiscard(true) });
    return () => registerBack(null);
  }, [registerBack]);

  // ✕, Escape and the scrim come through here: edits are not dropped without asking.
  function requestClose() {
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Unchanged → never save: a no-op save would still pin start_mode / arrivalMode.
    if (!dirty || submitting) return;
    let input: SaveInput;
    if (info.kind === 'hotel') {
      if (!info.hotelId || !info.hotelLeg) return;
      input = { target: 'hotel', hotelId: info.hotelId, leg: info.hotelLeg, mode };
    } else {
      if (!info.placeId) return;
      const d = durationBad ? ({ ok: false } as const) : parseDurationField(durationText);
      if (!d.ok) {
        setDurationError(true);
        durationRef.current?.focus();
        return;
      }
      input = {
        target: 'arrive',
        dayId: info.dayId,
        placeId: info.placeId,
        after: info.after,
        mode,
        durationMin: d.value,
        note: note.trim() === '' ? null : note,
      };
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await saveLegAction(input);
      if (res.ok) {
        (onSaved ?? onClose)();
        return;
      }
      // The sheet stays open with what was typed (e.g. the day's plan changed).
      setError(res.message);
    } catch (err) {
      logActionFailure('leg sheet', err);
      setError(t('leg_sheet_save_error'));
    }
    setSubmitting(false);
  }

  const shownMode = fields.editable ? mode : info.mode;
  const navUrl = fields.showNavigate
    ? gmapsDirectionsUrl([info.from, info.to], travelMode(shownMode))
    : null;
  const navigate = navUrl ? (
    <a
      className={buttonClasses('outline', 'md', styles.navigate)}
      href={navUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <NavArrow aria-hidden fill="currentColor" />
      {t('itin_segment_navigate')}
    </a>
  ) : null;

  const durationId = `${ids}-duration`;
  const durationErrId = `${ids}-duration-error`;
  const noteId = `${ids}-note`;
  const errorId = `${ids}-error`;

  return (
    <Modal
      open
      onRequestClose={requestClose}
      title={t('leg_sheet_title', { from: info.from.name, to: info.to.name })}
      size="sm"
    >
      <div className={styles.sheet} style={info.slot == null ? undefined : legStyle(info.slot)}>
        <button
          type="button"
          className={buttonClasses('ghost', 'icon', styles.close)}
          aria-label={t('leg_sheet_close')}
          onClick={requestClose}
        >
          <Close aria-hidden />
        </button>

        <div className={styles.head}>
          <span className={styles.rail} aria-hidden />
          <div className={styles.headText}>
            <h2 className={styles.title}>{t('leg_sheet_title', { from: info.from.name, to: info.to.name })}</h2>
            <div className={styles.sub}>
              {t('leg_sheet_sub', { from: info.fromNum, to: info.toNum, day: info.dayNum })}
            </div>
          </div>
        </div>

        {fields.editable ? (
          <form onSubmit={onSubmit} noValidate className="contents">
            <div className={styles.field}>
              <Segmented
                value={mode}
                onChange={setMode}
                ariaLabel={t('leg_sheet_mode')}
                className="flex w-full [&>button]:flex-1"
                options={MODES.map((m) => ({ value: m, label: t(MODE_LABEL[m]) }))}
              />
              {fields.showHotelHint ? <p className={styles.hint}>{t('leg_sheet_hotel_hint')}</p> : null}
            </div>

            {fields.showDuration ? (
              <div className={styles.field}>
                <label htmlFor={durationId} className={styles.label}>
                  {t('leg_sheet_duration')}
                </label>
                <Input
                  ref={durationRef}
                  id={durationId}
                  type="number"
                  min={0}
                  max={ARRIVE_DURATION_MAX}
                  step={1}
                  inputMode="numeric"
                  value={durationText}
                  invalid={durationError}
                  aria-describedby={durationError ? durationErrId : undefined}
                  onChange={(e) => {
                    setDurationText(e.target.value);
                    setDurationBad(e.target.validity.badInput);
                    setDurationError(false);
                  }}
                />
                {durationError ? (
                  <p id={durationErrId} className={styles.fieldError}>
                    {t('leg_sheet_duration_invalid')}
                  </p>
                ) : null}
              </div>
            ) : null}

            {fields.showNote ? (
              <div className={styles.field}>
                <label htmlFor={noteId} className={styles.label}>
                  {t('leg_sheet_note')}
                </label>
                <Textarea
                  id={noteId}
                  value={note}
                  maxLength={ARRIVE_NOTE_MAX}
                  rows={3}
                  placeholder={t('leg_sheet_note_placeholder')}
                  className={styles.note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
            ) : null}

            {error ? (
              <p id={errorId} role="alert" className={styles.error}>
                {error}
              </p>
            ) : null}

            <div className={styles.actions}>
              {navigate}
              <Button type="submit" loading={submitting} disabled={!dirty || submitting}>
                {t('save')}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <div className={styles.modeLine}>
              <ModeIcon mode={info.mode} />
              <span>
                {t(MODE_LABEL[info.mode])}
                {fields.showDuration && info.durationMin != null && info.durationMin > 0 ? (
                  <span className={styles.modeDuration}>
                    {' · '}
                    {t('itin_segment_duration_approx', { duration: formatDurationMin(info.durationMin) })}
                  </span>
                ) : null}
              </span>
            </div>
            {fields.showNote ? (
              <div className={styles.field}>
                <span className={styles.label}>{t('leg_sheet_note')}</span>
                {info.note ? (
                  <p className={styles.noteText}>{info.note}</p>
                ) : (
                  <p className={styles.noNote}>{t('leg_sheet_no_note')}</p>
                )}
              </div>
            ) : null}
            {navigate ? <div className={styles.actions}>{navigate}</div> : null}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmDiscard}
        title={t('leg_sheet_discard_title')}
        message={t('leg_sheet_discard_body')}
        confirmLabel={t('leg_sheet_discard_confirm')}
        onConfirm={onClose}
        onCancel={() => setConfirmDiscard(false)}
      />
    </Modal>
  );
}
