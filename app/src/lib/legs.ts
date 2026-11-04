import type { SegmentMode } from '@/lib/services/access';

export const ARRIVE_NOTE_MAX = 500;
export const ARRIVE_DURATION_MAX = 2880;

export type ArriveInput = {
  mode: SegmentMode;
  durationMin: number | null;
  note: string | null;
};
export type ArriveView = ArriveInput;
export type LegNote = { note: string | null; durationMin: number | null };

export const START_KEY = '__start__';

const EMPTY: LegNote = { note: null, durationMin: null };

export function pairKey(from: string, to: string): string {
  return `${from}>${to}`;
}

/** Index a day's leg notes by the (from, to) place pair they describe. */
export function legNotesByPair(
  order: string[],
  segs: { idx: number; note: string | null; durationMin: number | null }[],
  start: LegNote,
): Map<string, LegNote> {
  const map = new Map<string, LegNote>();
  if (order.length > 0) {
    map.set(pairKey(START_KEY, order[0]), { note: start.note, durationMin: start.durationMin });
  }
  for (const s of segs) {
    const from = order[s.idx];
    const to = order[s.idx + 1];
    if (from === undefined || to === undefined) continue;
    map.set(pairKey(from, to), { note: s.note, durationMin: s.durationMin });
  }
  return map;
}

/** Re-attach notes to legs after the place order changed; unknown pairs reset to null. */
export function realignLegNotes(
  before: Map<string, LegNote>,
  newOrder: string[],
  segIdxs: number[],
): {
  start: LegNote;
  segments: { idx: number; note: string | null; durationMin: number | null }[];
} {
  const lookup = (key: string): LegNote => {
    const hit = before.get(key);
    return hit ? { note: hit.note, durationMin: hit.durationMin } : { ...EMPTY };
  };
  const start =
    newOrder.length > 0 ? lookup(pairKey(START_KEY, newOrder[0])) : { ...EMPTY };
  const segments = segIdxs.map((idx) => {
    const from = newOrder[idx];
    const to = newOrder[idx + 1];
    const n = from !== undefined && to !== undefined ? lookup(pairKey(from, to)) : { ...EMPTY };
    return { idx, note: n.note, durationMin: n.durationMin };
  });
  return { start, segments };
}

export function dayStartView(d: {
  startMode: SegmentMode | null;
  startDurationMin: number | null;
  startNote: string | null;
}): ArriveView | null {
  if (d.startMode === null) return null;
  return { mode: d.startMode, durationMin: d.startDurationMin, note: d.startNote };
}

type SegRow = {
  idx: number;
  mode: SegmentMode;
  note: string | null;
  durationMin: number | null;
};

export function arriveForPlaces(
  placeCount: number,
  segs: SegRow[],
  start: ArriveView | null,
): (ArriveView | null)[] {
  const out: (ArriveView | null)[] = [];
  for (let j = 0; j < placeCount; j++) {
    if (j === 0) {
      out.push(start);
      continue;
    }
    const s = segs.find((x) => x.idx === j - 1);
    out.push(s ? { mode: s.mode, durationMin: s.durationMin, note: s.note } : null);
  }
  return out;
}

export function legDayView<
  D extends {
    startMode: SegmentMode | null;
    startDurationMin: number | null;
    startNote: string | null;
    places: object[];
    segments: SegRow[];
  },
>(
  d: D,
): Omit<D, 'startMode' | 'startDurationMin' | 'startNote' | 'places'> & {
  start: ArriveView | null;
  places: (D['places'][number] & { arrive: ArriveView | null })[];
} {
  const { startMode, startDurationMin, startNote, places, ...rest } = d;
  const start = dayStartView({ startMode, startDurationMin, startNote });
  const arrives = arriveForPlaces(places.length, d.segments, start);
  return {
    ...rest,
    start,
    places: places.map((p, i) => ({ ...(p as D['places'][number]), arrive: arrives[i] })),
  };
}

export function importLegRows(
  placeCount: number,
  arrives: (ArriveInput | null)[],
): {
  start: ArriveInput | null;
  segments: {
    idx: number;
    mode: SegmentMode;
    distance: string;
    time: string;
    note: string | null;
    durationMin: number | null;
  }[];
} {
  const segments = [];
  for (let j = 1; j < placeCount; j++) {
    const a = arrives[j] ?? { mode: 'drive' as const, note: null, durationMin: null };
    segments.push({
      idx: j - 1,
      mode: a.mode,
      distance: '',
      time: '',
      note: a.note,
      durationMin: a.durationMin,
    });
  }
  return { start: arrives[0] ?? null, segments };
}
