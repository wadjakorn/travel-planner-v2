'use client';

// Hosts the one leg detail sheet (leg-sheet.tsx) for the trip layout, so the
// itinerary list (page) and the persistent map (layout) open the same sheet
// through useLegSheet().openLeg. Renders no DOM of its own (the sheet is a
// portal): the phone full-map CSS selects on the layout's direct children.
//
// Over the phone full map the sheet owns one history entry
// (lib/full-map-history.ts LEG_SHEET_KEY), so the first Back closes the sheet
// (asking first when edited) and only the next one closes the map. Closing it
// any other way pops that entry.
//
// After a save it also nudges React until the new tree commits: see
// lib/router-nudge.ts (TP-0152 C1).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LegSheet, type LegSheetBackHandle } from './leg-sheet';
import { useMapPreview } from './map-preview-context';
import { useIsWide } from './use-trip-map-visible';
import { LEG_SHEET_KEY, isLegSheetEntry } from '@/lib/full-map-history';
import { nudgeUntil } from '@/lib/router-nudge';
import type { LegInfo } from '@/lib/leg-info';

type Origin = 'list' | 'map';
type Ctx = { openLeg: (info: LegInfo, origin: Origin) => void };

const LegSheetCtx = createContext<Ctx>({ openLeg: () => {} });

// No URL argument, and the spread keeps Next's __NA (and the map entry's
// FULLMAP_KEY): its patched pushState passes the entry straight through.
const pushEntry = () => window.history.pushState({ ...window.history.state, [LEG_SHEET_KEY]: 1 }, '');

export function LegSheetProvider({ canEdit, children }: { canEdit: boolean; children: ReactNode }) {
  const [open, setOpen] = useState<{ info: LegInfo; origin: Origin } | null>(null);
  const { fullMap } = useMapPreview();
  const isWide = useIsWide();
  /** We pushed the sheet's history entry and haven't left it. */
  const owns = useRef(false);
  const back = useRef<LegSheetBackHandle | null>(null);

  const openLeg = useCallback(
    (info: LegInfo, origin: Origin) => {
      if (origin === 'map' && fullMap && !isWide && !owns.current) {
        pushEntry();
        owns.current = true;
      }
      setOpen({ info, origin });
    },
    [fullMap, isWide],
  );

  const close = useCallback(() => {
    setOpen(null);
    if (owns.current) {
      // Pops our entry; landing on the map's (tagged) entry keeps the map open
      // (closeAction), and owns is already false so onPop below ignores it.
      owns.current = false;
      window.history.back();
    }
  }, []);

  // The layout's payload (our children) is a new object once the router
  // commits a tree rendered after the save; until then, keep nudging.
  const [, setNudge] = useState(0);
  const tree = useRef(children);
  useEffect(() => {
    tree.current = children;
  }, [children]);
  const stopNudge = useRef<(() => void) | null>(null);
  useEffect(() => () => stopNudge.current?.(), []);

  const saved = useCallback(() => {
    const before = tree.current;
    stopNudge.current?.();
    stopNudge.current = nudgeUntil(
      () => tree.current !== before,
      () => setNudge((n) => n + 1),
    );
    close();
  }, [close]);

  const registerBack = useCallback((h: LegSheetBackHandle | null) => {
    back.current = h;
  }, []);

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      if (!owns.current || isLegSheetEntry(e.state)) return;
      const h = back.current;
      if (h?.dirty()) {
        // Keep the sheet (and its entry) until the user decides; discarding
        // closes through close() above, which pops the entry again.
        pushEntry();
        h.askDiscard();
        return;
      }
      owns.current = false;
      setOpen(null);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const value = useMemo(() => ({ openLeg }), [openLeg]);
  return (
    <LegSheetCtx.Provider value={value}>
      {children}
      {open ? (
        <LegSheet
          key={open.info.key}
          info={open.info}
          readOnly={!canEdit}
          onClose={close}
          onSaved={saved}
          registerBack={registerBack}
        />
      ) : null}
    </LegSheetCtx.Provider>
  );
}

export function useLegSheet(): Ctx {
  return useContext(LegSheetCtx);
}
