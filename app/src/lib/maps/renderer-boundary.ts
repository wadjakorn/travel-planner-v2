export type BoundaryView = 'children' | 'empty' | 'rethrow';

/**
 * What the map renderer boundary (sits above the google/maplibre choice)
 * renders after catching an error.
 *
 * - google: the session is about to degrade (markDegraded in didCatch), render
 *   nothing for that one pass.
 * - maplibre: the first catch batch is the Google subtree throwing while it is
 *   torn down (AdvancedMarker cleanup on a dead map); keep rendering the
 *   MapLibre children. A repeat batch means MapLibre itself is failing, so
 *   rethrow to the route boundary instead of looping.
 */
export function rendererBoundaryView(
  caught: boolean,
  renderer: 'google' | 'maplibre',
  maplibreCatchBatches: number,
): BoundaryView {
  if (!caught) return 'children';
  if (renderer === 'google') return 'empty';
  return maplibreCatchBatches < 2 ? 'children' : 'rethrow';
}
