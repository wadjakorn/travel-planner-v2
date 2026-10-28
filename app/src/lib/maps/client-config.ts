export type ClientMapsConfig = {
  renderer: 'google' | 'maplibre';
  browserKey: string;
  mapId: string;
  poiAdd: boolean;
};

export const OPEN_CLIENT_CONFIG: ClientMapsConfig = { renderer: 'maplibre', browserKey: '', mapId: '', poiAdd: false };

export function effectiveRenderer(cfg: ClientMapsConfig, degraded: boolean): 'google' | 'maplibre' {
  return cfg.renderer === 'google' && cfg.browserKey !== '' && cfg.mapId !== '' && !degraded
    ? 'google'
    : 'maplibre';
}
