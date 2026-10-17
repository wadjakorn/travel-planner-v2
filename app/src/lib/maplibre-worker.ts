'use client';

import { setWorkerUrl } from 'maplibre-gl';

// maplibre-gl 6 locates its worker via its own import.meta.url, which the
// bundler rewrites to a chunk path, so the worker 404s. Hand it a bundler-
// resolved asset URL instead (the worker bundle is self-contained).
setWorkerUrl(
  new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).href,
);
