// Parse the `arrive` leg descriptor from a JSON request body (TP-0141).

import { ServiceError } from '@/lib/services/service-error';
import {
  ARRIVE_DURATION_MAX,
  ARRIVE_NOTE_MAX,
  type ArriveInput,
} from '@/lib/legs';

const MODES = ['drive', 'walk', 'transit'] as const;

function bad(message: string): never {
  throw new ServiceError('bad_request', message);
}

export function parseArrive(v: unknown, label = '"arrive"'): ArriveInput {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    bad(`${label} must be an object or null`);
  }
  const o = v as Record<string, unknown>;
  const name = label.replace(/"$/, '');
  if (typeof o.mode !== 'string' || !(MODES as readonly string[]).includes(o.mode)) {
    bad(`${name}.mode" must be one of: ${MODES.join(', ')}`);
  }
  let durationMin: number | null = null;
  if (o.durationMin !== undefined && o.durationMin !== null) {
    const d = o.durationMin;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > ARRIVE_DURATION_MAX) {
      bad(`${name}.durationMin" must be an integer 0..${ARRIVE_DURATION_MAX}`);
    }
    durationMin = d;
  }
  let note: string | null = null;
  if (o.note !== undefined && o.note !== null) {
    if (typeof o.note !== 'string') {
      bad(`${name}.note" must be a string of at most ${ARRIVE_NOTE_MAX} characters`);
    }
    const t = o.note.trim();
    if (t.length > ARRIVE_NOTE_MAX) {
      bad(`${name}.note" must be a string of at most ${ARRIVE_NOTE_MAX} characters`);
    }
    note = t === '' ? null : t;
  }
  return { mode: o.mode as ArriveInput['mode'], durationMin, note };
}

/** absent -> undefined (leave unchanged), null -> null (clear), else parsed. */
export function readArrive(body: Record<string, unknown>): ArriveInput | null | undefined {
  if (!('arrive' in body) || body.arrive === undefined) return undefined;
  if (body.arrive === null) return null;
  return parseArrive(body.arrive);
}
