import type { Fields } from './types';

const HEX = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

// v4 UUID from getRandomValues. NOT crypto.randomUUID: the dev app is opened
// over plain HTTP (Tailscale), which is not a secure context.
export function newSessionToken(
  rand: (b: Uint8Array) => Uint8Array = (b) => globalThis.crypto.getRandomValues(b),
): string {
  const b = rand(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = HEX(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export type SessionHolder = {
  get(): string;
  take(): string | null;
  reset(): void;
};

// One token per search session. take() hands the token to the pick that ends
// the session and clears it synchronously, so later typing starts a new one.
export function createSessionHolder(gen: () => string = newSessionToken): SessionHolder {
  let tok: string | null = null;
  return {
    get() {
      return (tok ??= gen());
    },
    take() {
      const t = tok;
      tok = null;
      return t;
    },
    reset() {
      tok = null;
    },
  };
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseSessionParam(v: string | null): string | null {
  return v && UUID_V4.test(v) ? v : null;
}

export function parseFieldsParam(v: string | null): Fields {
  return v === 'full' || v === 'preview' ? v : 'basic';
}
