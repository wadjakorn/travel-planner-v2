'use client';

import { createContext, useContext, useMemo } from 'react';
import type { Pin } from '@/lib/map-helpers';
import type { Units } from '@/lib/units';

// Each day's located stops (the map's pins) and the user's units, for the
// add-place search's "≈ 1.2 km from <stop>" lines. The layout passes the same
// Pin[] arrays it gives PersistentMap, so the RSC payload shares them.

type DayStops = { stopsByDay: Record<string, Pin[]>; units: Units };

const DayStopsContext = createContext<DayStops | null>(null);

export function DayStopsProvider({ stopsByDay, units, children }: DayStops & { children: React.ReactNode }) {
  const value = useMemo(() => ({ stopsByDay, units }), [stopsByDay, units]);
  return <DayStopsContext.Provider value={value}>{children}</DayStopsContext.Provider>;
}

/** The day's stops + units; null outside the provider or for an unknown day. */
export function useDayStops(dayId: string | undefined): { pins: Pin[]; units: Units } | null {
  const ctx = useContext(DayStopsContext);
  if (!ctx || !dayId || !(dayId in ctx.stopsByDay)) return null;
  return { pins: ctx.stopsByDay[dayId], units: ctx.units };
}
