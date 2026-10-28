'use client';

import { createContext, useContext } from 'react';
import type { BiasCenters } from '@/lib/places/bias-center';
import type { LatLng } from '@/lib/places/bias';

const PlaceBiasContext = createContext<BiasCenters | null>(null);

export function PlaceBiasProvider({ centers, children }: { centers: BiasCenters; children: React.ReactNode }) {
  return <PlaceBiasContext.Provider value={centers}>{children}</PlaceBiasContext.Provider>;
}

export function usePlaceBias(dayId?: string): LatLng | null {
  const centers = useContext(PlaceBiasContext);
  if (!centers) return null;
  return dayId && dayId in centers.byDay ? centers.byDay[dayId] : centers.trip;
}
