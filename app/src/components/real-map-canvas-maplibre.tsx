'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import '@/lib/maplibre-worker';
import { useId, useMemo, useRef, useState } from 'react';
import type { Map as MaplibreMap } from 'maplibre-gl';
import Map, { Marker, Popup, type MapRef } from 'react-map-gl/maplibre';
import { ZoomIn, Minus, Route, Clock } from '@/components/icons';
import { FIT_MAX_ZOOM, fitPadding, frameSig, initialCamera, pinBounds, pinPopups } from '@/lib/map-helpers';
import { mapStyleUrl } from '@/lib/map-style';
import { arcByKey, rideArcs, rideEnds, routeArcs } from '@/lib/map-route';
import { useLegsShown } from '@/lib/maps/legs-store';
import { useTheme } from '@/lib/use-theme';
import { GHOST_Z_INDEX, POPUP_Z_INDEX, PREVIEW_Z_INDEX, pinAnchor, pinPopupOffset, pinZIndex } from '@/lib/map-pin';
import {
  ghostTitle,
  groupClickTarget,
  groupHoverId,
  groupLabel,
  groupPins,
  groupTitle,
  hoverInGroups,
} from '@/lib/map-ghosts';
import { MapDegradedChip } from './map-degraded-chip';
import { MapPin } from './map-pin';
import { GhostDot } from './map-ghost-dot';
import { ActiveFocus } from './map-active-focus-maplibre';
import { ROUTE_HIT_LAYER, RouteLinesMaplibre } from './map-route-maplibre';
import { RideLinesMaplibre } from './map-rides-maplibre';
import { MapLegsToggle } from './map-legs-toggle';
import { PreviewMarker, PreviewPopupBody } from './map-preview-marker';
import { PinCard, PinTooltip } from './pin-card';
import type { RealMapCanvasProps } from './map-renderer-props';
import { useT } from './i18n-provider';
import styles from './map-canvas.module.css';

// MapLibre renderer for the trip map (selected by real-map-canvas.tsx).
// Presentational map canvas. Mounted once by the trip layout
// (persistent-map.tsx) so this instance survives client navigation; day/active
// selection + routing live in the parent and arrive via props + onActivate.
export default function RealMapCanvasMaplibre({
  summary,
  totalDistance,
  totalTime,
  pins,
  legs,
  rides,
  activePlaceId,
  onActivate,
  onLegSelect,
  onViewport,
  hover,
  onPinHover,
  preview,
  hidePinCard,
  previewNear,
  fallbackFrame = [],
  emptyNote,
  ghosts,
  onGhostClick,
}: RealMapCanvasProps) {
  const theme = useTheme();
  const t = useT();
  const summaryId = useId();
  const mapRef = useRef<MapRef>(null);
  // Mount-time only (initialViewState); ActiveFocus moves it after.
  const frame = pins.length ? pins : fallbackFrame;
  const { center, zoom } = initialCamera(frame, preview ?? null);
  const bounds = pinBounds(frame);

  // Manual zoom controls. zoomTo clamps to the map's own min/max, so no
  // bounds math is needed here.
  const zoomBy = (delta: number) => {
    const m = mapRef.current;
    if (m) m.zoomTo(m.getZoom() + delta);
  };
  const showDistChip = Boolean(totalDistance && totalTime);
  // Stops at identical coordinates draw as one `1 · 4` marker (lib/map-ghosts).
  const groups = useMemo(() => groupPins(pins), [pins]);
  // Day route (lib/map-route): computed once for the lines, the badges and the toggle.
  const arcs = useMemo(() => routeArcs(pins, legs ?? []), [pins, legs]);
  // The day's transport rides (TP-0142): drawn only, never framed (R3) or tapped (R5).
  const rideLines = useMemo(() => rideArcs(rides ?? []), [rides]);
  const rideMarks = useMemo(() => rideEnds(rides ?? []), [rides]);
  const legsShown = useLegsShown();
  // The search preview pin takes no clicks: with leg taps on, a tap on it over a
  // line would select the leg and drop the preview.
  const legsInteractive = legsShown && !preview && !!onLegSelect;
  const [legCursor, setLegCursor] = useState<string | undefined>(undefined);
  const activeId = activePlaceId ?? null;
  // The active pin keeps its card (photo for Google places, ✕) while hovering
  // another pin adds a light name tooltip (M6). A list hover only lifts the pin.
  const { cardId, tipId } = pinPopups({
    hoveredId: hoverInGroups(groups, hover?.source === 'map' ? hover.placeId : null, activeId),
    activeId,
    preview: !!preview,
    hideCard: !!hidePinCard,
  });
  const cardPin = cardId ? pins.find((p) => p.id === cardId) : null;
  const tipPin = tipId ? pins.find((p) => p.id === tipId) : null;
  const report = (e: { target: MaplibreMap }) => {
    const b = e.target.getBounds();
    onViewport?.({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
  };

  return (
    <div
      className={styles.mapWrap}
      role="region"
      aria-label={t('map_region_aria')}
      aria-describedby={summary ? summaryId : undefined}
      // Focus target when a popup closes from inside (usePopupDismiss).
      data-trip-map
      tabIndex={-1}
    >
      {summary ? (
        <p id={summaryId} className="sr-only">
          {summary}
        </p>
      ) : null}
        <Map
          ref={mapRef}
          id="trip-map"
          // isolate: markers now carry z-indexes (10…1000); keep them inside
          // the map so they don't paint over the chips (z 5), the stop
          // carousel or page overlays. Google's .gm-style already does this.
          style={{ width: '100%', height: '100%', isolation: 'isolate' }}
          initialViewState={
            bounds
              ? { bounds, fitBoundsOptions: { padding: fitPadding(false), maxZoom: FIT_MAX_ZOOM } }
              : { longitude: center.lng, latitude: center.lat, zoom }
          }
          mapStyle={mapStyleUrl(theme)}
          onLoad={report}
          onMoveEnd={report}
          // Route line taps (hit layer only while interactive). Pin, ghost and badge
          // markers stop their click, so this only sees taps on the map itself.
          interactiveLayerIds={legsInteractive ? [ROUTE_HIT_LAYER] : undefined}
          cursor={legsInteractive ? legCursor : undefined}
          onMouseEnter={() => setLegCursor('pointer')}
          onMouseLeave={() => setLegCursor(undefined)}
          onClick={(e) => {
            const arc = arcByKey(arcs, e.features?.[0]?.properties?.key);
            if (arc) onLegSelect?.(arc.info);
          }}
        >
          <ActiveFocus
            activePin={
              activePlaceId
                ? pins.find((p) => p.id === activePlaceId) ?? null
                : null
            }
            pins={pins}
            frameSig={frameSig(pins, fallbackFrame)}
            fallback={fallbackFrame}
            preview={preview}
            stripVisible={hidePinCard}
          />
          {/* Day route: canvas layers, so always under the DOM pin markers. */}
          <RouteLinesMaplibre arcs={arcs} show={legsShown} interactive={legsInteractive} onSelect={(arc) => onLegSelect?.(arc.info)} />
          {/* After the legs: its layers go beforeId the legs' hit layer, which must exist. */}
          <RideLinesMaplibre arcs={rideLines} ends={rideMarks} show={legsShown} />
          {/* Other days' stops (md+), under every pin; a click switches day.
              Explicit zIndex: marker DOM order changes as ghosts remount. */}
          {ghosts?.map((g) => (
            <Marker
              key={`ghost:${g.key}`}
              longitude={g.lng}
              latitude={g.lat}
              anchor="center"
              style={{ zIndex: GHOST_Z_INDEX }}
              onClick={(e) => {
                e.originalEvent.stopPropagation();
                onGhostClick?.(g.dayIdx);
              }}
            >
              <GhostDot title={ghostTitle(g, t)} interactive />
            </Marker>
          ))}
          {groups.map((g) => {
            const first = g.pins[0];
            const active = g.pins.some((p) => p.id === activeId);
            const highlight = g.pins.some((p) => p.id === hover?.placeId);
            const anchor = pinAnchor(first.kind);
            return (
              <Marker
                // `anchor` is construction-time in react-map-gl: a kind edit
                // (sight ↔ hotel) must remount the marker to re-anchor it.
                key={`${g.key}:${anchor}`}
                longitude={g.lng}
                latitude={g.lat}
                anchor={anchor}
                style={{ zIndex: pinZIndex(active, highlight) }}
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  // Cycles a merged marker: first → … → last → closed.
                  onActivate?.(groupClickTarget(g, activeId));
                }}
              >
                <div
                  // Mouse only: touch fires a compat enter with no leave, which would
                  // pin the tooltip open after the card is closed.
                  onPointerEnter={(e) => e.pointerType === 'mouse' && onPinHover?.(groupHoverId(g, activeId))}
                  onPointerLeave={(e) => e.pointerType === 'mouse' && onPinHover?.(null)}
                >
                  {/* A named <button>: the custom marker element is not focusable.
                      Its click bubbles to the Marker's listener, so Enter/Space
                      activate once with no extra handler. */}
                  <MapPin
                    pin={first}
                    label={groupLabel(g)}
                    name={groupTitle(g, t)}
                    active={active}
                    highlight={highlight}
                    interactive
                  />
                </div>
              </Marker>
            );
          })}
          {preview ? (
            <>
              <Marker
                longitude={preview.lng}
                latitude={preview.lat}
                anchor="bottom"
                style={{ zIndex: PREVIEW_Z_INDEX }}
              >
                <PreviewMarker name={preview.name} />
              </Marker>
              {/* closeOnClick off: empty-map clicks must not exit the preview. */}
              <Popup
                longitude={preview.lng}
                latitude={preview.lat}
                anchor="bottom"
                offset={pinPopupOffset('sight', false)}
                style={{ zIndex: POPUP_Z_INDEX }}
                closeButton={false}
                closeOnClick={false}
                maxWidth="none"
                focusAfterOpen={false}
                className="tp-preview-popup"
              >
                <PreviewPopupBody key={preview.id} preview={preview} near={previewNear} />
              </Popup>
            </>
          ) : null}
          {cardPin ? (
            <Popup
              key="card"
              longitude={cardPin.lng}
              latitude={cardPin.lat}
              anchor="bottom"
              offset={pinPopupOffset(cardPin.kind, true)}
              style={{ zIndex: POPUP_Z_INDEX }}
              closeButton={false}
              closeOnClick={false}
              focusAfterOpen={false}
              maxWidth="none"
              className="tp-preview-popup"
            >
              <PinCard key={cardPin.id} pin={cardPin} onClose={() => onActivate?.(cardPin.id)} />
            </Popup>
          ) : null}
          {tipPin ? (
            <Popup
              key="tip"
              longitude={tipPin.lng}
              latitude={tipPin.lat}
              anchor="bottom"
              offset={pinPopupOffset(tipPin.kind, false)}
              style={{ zIndex: POPUP_Z_INDEX }}
              closeButton={false}
              closeOnClick={false}
              focusAfterOpen={false}
            >
              <PinTooltip pin={tipPin} />
            </Popup>
          ) : null}
        </Map>

      {/* Top-right: route lines toggle, then the "Backup map" notice while Google is unavailable */}
      <div className={styles.overlayTr}>
        {arcs.length > 0 || rideMarks.length > 0 ? <MapLegsToggle /> : null}
        <MapDegradedChip />
      </div>

      {/* Bottom-right: zoom +/- buttons */}
      <div data-map-zoom className={styles.overlayBr}>
        <div className={styles.zoomStack}>
          <button type="button" aria-label={t('map_zoom_in')} onClick={() => zoomBy(1)}>
            <ZoomIn />
          </button>
          <button type="button" aria-label={t('map_zoom_out')} onClick={() => zoomBy(-1)}>
            <Minus />
          </button>
        </div>
      </div>

      {/* Bottom-left: distance / time chip, or the empty-day note */}
      {(showDistChip || emptyNote) && (
        <div data-map-dist className={styles.overlayBl}>
          {emptyNote ? (
            <div className={styles.mapPill} role="status">
              {emptyNote}
            </div>
          ) : (
            <>
              {/* One spoken label; the two visual pills are hidden from AT. */}
              <span className="sr-only">
                {t('map_travel_total_aria', { distance: totalDistance ?? '', time: totalTime ?? '' })}
              </span>
              <div className={styles.mapPill} aria-hidden>
                <Route width={13} height={13} />
                {totalDistance}
              </div>
              <div className={styles.mapPill} aria-hidden>
                <Clock width={13} height={13} />
                {totalTime}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
