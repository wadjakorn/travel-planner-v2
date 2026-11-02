import { useSyncExternalStore } from 'react';

// Route lines on the trip map: shown unless the user turned them off on this
// device (components/map-legs-toggle.tsx). Only "hidden" is stored, so the
// default needs no write. Blocked storage (private mode) keeps the choice for
// the page session.

const KEY = 'tp.mapLegs';
const listeners = new Set<() => void>();
// Set only while storage is blocked; null = read storage.
let memHidden: boolean | null = null;

export function getLegsShown(): boolean {
  if (memHidden != null) return !memHidden;
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function subscribeLegs(cb: () => void): () => void {
  listeners.add(cb);
  // Another tab toggled.
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

export function toggleLegs(): void {
  const hide = getLegsShown();
  try {
    if (hide) localStorage.setItem(KEY, '0');
    else localStorage.removeItem(KEY);
    memHidden = null;
  } catch {
    memHidden = hide;
  }
  listeners.forEach((cb) => cb());
}

/** Server snapshot = shown (the trip canvases are client-only, so it is not used in practice). */
export function useLegsShown(): boolean {
  return useSyncExternalStore(subscribeLegs, getLegsShown, () => true);
}
