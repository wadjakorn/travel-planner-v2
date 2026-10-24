'use client';

import { Component, type ReactNode } from 'react';
import { useGoogleMapsConfig } from './maps-config-provider';

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
