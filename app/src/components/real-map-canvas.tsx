'use client';

import dynamic from 'next/dynamic';
import { useMapRenderer } from './maps-config-provider';
import type { RealMapCanvasProps } from './map-renderer-props';

// Trip map renderer selector. Each renderer is its own client-only chunk, so
// google mode never requests maplibre-gl and open mode never loads Google.
const RealMapCanvasGoogle = dynamic(() => import('./real-map-canvas-google'), { ssr: false });
const RealMapCanvasMaplibre = dynamic(() => import('./real-map-canvas-maplibre'), { ssr: false });

export default function RealMapCanvas(props: RealMapCanvasProps) {
  return useMapRenderer() === 'google' ? (
    <RealMapCanvasGoogle {...props} />
  ) : (
    <RealMapCanvasMaplibre {...props} />
  );
}
