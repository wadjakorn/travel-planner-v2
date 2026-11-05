import { toPhotonParams, type Bias } from './bias';
import { kindFromOsm } from './kind';
import type { PlaceSuggestion } from './types';

type Feature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string; osm_id?: number; osm_key?: string; osm_value?: string; name?: string;
    housenumber?: string; street?: string; district?: string; city?: string; state?: string; country?: string;
  };
};

export function parsePhoton(json: unknown): PlaceSuggestion[] {
  const features = (json as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: PlaceSuggestion[] = [];
  for (const f of features as Feature[]) {
    const p = f.properties ?? {};
    const [lng, lat] = f.geometry?.coordinates ?? [];
    if (!p.name || !p.osm_type || p.osm_id == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const street = [p.street, p.housenumber].filter(Boolean).join(' ');
    const secondary = [street, p.district, p.city, p.state, p.country].filter(Boolean).join(', ') || null;
    out.push({
      id: `osm:${p.osm_type}${p.osm_id}`,
      name: p.name,
      secondary,
      address: secondary ? `${p.name}, ${secondary}` : p.name,
      lat: lat!,
      lng: lng!,
      kind: kindFromOsm(p.osm_key, p.osm_value),
      timeZone: null,
    });
  }
  return out;
}

// Public photon.komoot.io answers ~4 s and 503s under parallel load (TP-0151):
// one request in flight per process, a 6 s timeout of its own, and one retry
// on 503/429.
const PHOTON_TIMEOUT_MS = 6000;
const RETRY_DELAY_MS = 600;
let gate: Promise<unknown> = Promise.resolve();

function abortError(signal?: AbortSignal): unknown {
  return signal?.reason ?? new DOMException('Aborted', 'AbortError');
}

// Runs `fn` after every earlier gated call settles. A waiter whose signal
// aborts rejects at once; the queue moves on without it.
function serialized<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const turn = gate.then(
    () => undefined,
    () => undefined,
  );
  const run = turn.then(() => {
    if (signal?.aborted) throw abortError(signal);
    return fn();
  });
  gate = run.catch(() => undefined);
  if (!signal) return run;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(signal));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    run.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError(signal));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), reject(abortError(signal))), { once: true });
  });
}

export async function photonSearch(
  q: string,
  { fetchImpl = fetch, limit = 8, signal, bias, retryDelayMs = RETRY_DELAY_MS }: {
    fetchImpl?: typeof fetch;
    limit?: number;
    signal?: AbortSignal;
    bias?: Bias | null;
    retryDelayMs?: number;
  } = {},
): Promise<PlaceSuggestion[]> {
  const url = new URL('https://photon.komoot.io/api/');
  const center = bias ? toPhotonParams(bias) : { lat: '13.75', lon: '100.5' };
  url.search = new URLSearchParams({ q, limit: String(limit), ...center }).toString();
  const once = () =>
    fetchImpl(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(PHOTON_TIMEOUT_MS)].filter((s): s is AbortSignal => !!s)),
      headers: { 'User-Agent': 'travel-planner-v2' },
      next: { revalidate: 60 * 60 * 24 * 30 },
    } as RequestInit);
  return serialized(async () => {
    let res = await once();
    if (res.status === 503 || res.status === 429) {
      await sleep(retryDelayMs, signal);
      res = await once();
    }
    if (!res.ok) throw new Error(`photon ${res.status}`);
    return parsePhoton(await res.json());
  }, signal);
}
