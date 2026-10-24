import { describe, expect, it } from 'vitest';
import { rendererBoundaryView } from './renderer-boundary';

describe('rendererBoundaryView', () => {
  it('renders children until something is caught', () => {
    expect(rendererBoundaryView(false, 'google', 0)).toBe('children');
    expect(rendererBoundaryView(false, 'maplibre', 5)).toBe('children');
  });
  it('renders nothing while still on google after a catch', () => {
    expect(rendererBoundaryView(true, 'google', 0)).toBe('empty');
  });
  it('keeps MapLibre children through the Google teardown catch', () => {
    expect(rendererBoundaryView(true, 'maplibre', 0)).toBe('children');
    expect(rendererBoundaryView(true, 'maplibre', 1)).toBe('children');
  });
  it('rethrows once MapLibre keeps failing', () => {
    expect(rendererBoundaryView(true, 'maplibre', 2)).toBe('rethrow');
  });
});
