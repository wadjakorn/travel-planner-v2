'use client';

import { Component, type ReactNode } from 'react';
import { rendererBoundaryView } from '@/lib/maps/renderer-boundary';
import { useGoogleMapsConfig, useMapRenderer } from './maps-config-provider';

// Contains a throwing Google map (e.g. an AdvancedMarker attaching to a map
// that just failed auth) so it never reaches the route error boundary: the
// error degrades the page session, and the renderer selectors swap to MapLibre.
// markDegraded is warn-once, so this adds no log line after gm_authFailure.
class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function GoogleMapErrorBoundary({ children }: { children: ReactNode }) {
  const { markDegraded } = useGoogleMapsConfig();
  return <Boundary onError={markDegraded}>{children}</Boundary>;
}

// Sits ABOVE the google/maplibre choice in the renderer selectors, so it stays
// mounted while the Google subtree is deleted. After an auth failure, vis.gl's
// AdvancedMarker cleanup sets marker.map = null on the dead map and throws
// during that deletion; a boundary inside the deleted subtree cannot catch it.
// This one does, and keeps rendering the (now MapLibre) children.
type RendererProps = {
  renderer: 'google' | 'maplibre';
  onError: () => void;
  children: ReactNode;
};

class RendererBoundary extends Component<RendererProps, { caught: boolean; error: unknown }> {
  state = { caught: false, error: null as unknown };
  // Catch batches while on MapLibre. Several markers can throw in one commit;
  // they count as one batch (one microtask).
  private maplibreBatches = 0;
  private batchOpen = false;

  static getDerivedStateFromError(error: unknown): { caught: boolean; error: unknown } {
    return { caught: true, error };
  }

  componentDidCatch() {
    this.props.onError();
    if (this.props.renderer === 'maplibre' && !this.batchOpen) {
      this.batchOpen = true;
      this.maplibreBatches += 1;
      queueMicrotask(() => {
        this.batchOpen = false;
      });
    }
  }

  render() {
    const view = rendererBoundaryView(this.state.caught, this.props.renderer, this.maplibreBatches);
    if (view === 'rethrow') throw this.state.error;
    return view === 'empty' ? null : this.props.children;
  }
}

export function MapRendererBoundary({ children }: { children: ReactNode }) {
  const renderer = useMapRenderer();
  const { markDegraded } = useGoogleMapsConfig();
  return (
    <RendererBoundary renderer={renderer} onError={markDegraded}>
      {children}
    </RendererBoundary>
  );
}
