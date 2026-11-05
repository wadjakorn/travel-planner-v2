// What the leg detail sheet (components/leg-sheet.tsx) shows, and its duration
// field's parsing. Pure, so the rules are unit-tested without the component.

import type { LegInfo } from './leg-info';
import { ARRIVE_DURATION_MAX } from './legs';
import { missingLocation } from './segment-fix';

export type LegSheetFields = {
  editable: boolean;
  showDuration: boolean;
  showNote: boolean;
  showHotelHint: boolean;
  showNavigate: boolean;
};

/** Hotel legs store only a mode (on the hotel, for every night), so they have
 *  no time or note. Navigate needs both ends located, like the list's bar. */
export function legSheetFields(info: LegInfo, readOnly: boolean): LegSheetFields {
  const editable = !readOnly;
  const hotel = info.kind === 'hotel';
  const missing = missingLocation({ ...info.from, id: info.fromId }, { ...info.to, id: info.toId }, null);
  return {
    editable,
    showDuration: !hotel,
    showNote: !hotel,
    showHotelHint: editable && hotel,
    showNavigate: missing == null,
  };
}

/** The minutes field: blank clears it (null); otherwise a whole number in the
 *  API's range (parseArrive), checked here so a bad value is never sent. */
export function parseDurationField(text: string): { ok: true; value: number | null } | { ok: false } {
  const s = text.trim();
  if (s === '') return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false };
  const n = Number(s);
  return n <= ARRIVE_DURATION_MAX ? { ok: true, value: n } : { ok: false };
}
