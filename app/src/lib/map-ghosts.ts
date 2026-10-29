import type { MapDay } from './day-augment';
import type { Translate } from './i18n-client';
import type { Pin } from './map-helpers';
import { pinTitle, stopName } from './map-pin';

// Pure rules for the md+ trip map: other days' stops as ghost dots, and stops
// at identical coordinates (a hotel's begin/end copies on a middle night)
// merged into one `1 · 4` pin. Shared by the Google and MapLibre renderers.

/** ≈0.1 m. Hotel begin/end copies are bit-identical, so they always match. */
export function coordKey(p: { lat: number; lng: number }): string {
  return `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
}

export type PinGroup = { key: string; lat: number; lng: number; pins: Pin[] };

/** One group per coordinate, in first-occurrence order; pins keep input order. */
export function groupPins(pins: Pin[]): PinGroup[] {
  const byKey = new Map<string, PinGroup>();
  for (const p of pins) {
    const key = coordKey(p);
    const g = byKey.get(key);
    if (g) g.pins.push(p);
    else byKey.set(key, { key, lat: p.lat, lng: p.lng, pins: [p] });
  }
  return [...byKey.values()];
}

/** Marker text: the stops' list numbers, `1 · 4`. */
export function groupLabel(g: PinGroup): string {
  return g.pins.map((p) => p.idx).join(' · ');
}

/**
 * The id to activate on a click, cycling first → … → last → closed: the last
 * pin's own id makes the owner's `activate` toggle it off.
 */
export function groupClickTarget(g: PinGroup, activeId: string | null): string {
  const i = activeId ? g.pins.findIndex((p) => p.id === activeId) : -1;
  if (i < 0) return g.pins[0].id;
  return g.pins[Math.min(i + 1, g.pins.length - 1)].id;
}

/**
 * The stop a hover over the group stands for: the active one when it is in the
 * group, so the tooltip/card follow the click cycle while the mouse stays put.
 */
export function groupHoverId(g: PinGroup, activeId: string | null): string {
  return g.pins.find((p) => p.id === activeId)?.id ?? g.pins[0].id;
}

/**
 * The hovered stop as the popups should see it: a hover anywhere in a merged
 * group follows that group's active stop (`groupHoverId`).
 */
export function hoverInGroups(groups: PinGroup[], placeId: string | null, activeId: string | null): string | null {
  if (!placeId) return null;
  const g = groups.find((x) => x.pins.some((p) => p.id === placeId));
  return g ? groupHoverId(g, activeId) : placeId;
}

/** Accessible name of a merged marker: `Stop 1: Hotel; Stop 4: Hotel`. */
export function groupTitle(g: PinGroup, t: Translate): string {
  return g.pins.map((p) => pinTitle(p, t)).join('; ');
}

/** `name` / `idx`: the stop's own name (unnamed → `Stop n` in ghostTitle) and list number on its day. */
export type GhostPin = { key: string; lat: number; lng: number; dayIdx: number; name?: string; idx: number };

/** Ghost marker name / hover title: `Day 4: Senso-ji`. */
export function ghostTitle(g: Pick<GhostPin, 'dayIdx' | 'name' | 'idx'>, t: Translate): string {
  return t('map_ghost_title', { n: g.dayIdx + 1, name: stopName(g, t) });
}

/**
 * Every other day's stops, one per coordinate, skipping coordinates the shown
 * day already has a pin on. A coordinate on several days goes to the day
 * nearest `dayIdx` (tie → earlier), with that day's stop name.
 */
export function ghostPins(days: MapDay[], dayIdx: number): GhostPin[] {
  const taken = new Set((days[dayIdx]?.pins ?? []).map(coordKey));
  const out = new Map<string, GhostPin>();
  for (const d of days) {
    if (d.idx === dayIdx) continue;
    const dist = Math.abs(d.idx - dayIdx);
    for (const p of d.pins) {
      const key = coordKey(p);
      if (taken.has(key)) continue;
      const prev = out.get(key);
      if (prev) {
        const prevDist = Math.abs(prev.dayIdx - dayIdx);
        if (prevDist < dist || (prevDist === dist && prev.dayIdx <= d.idx)) continue;
      }
      out.set(key, { key, lat: p.lat, lng: p.lng, dayIdx: d.idx, name: p.name, idx: p.idx });
    }
  }
  return [...out.values()];
}
