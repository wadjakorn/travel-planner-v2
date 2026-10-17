const BASE = 'https://tiles.openfreemap.org/styles';

export function mapStyleUrl(theme: string): string {
  return `${BASE}/${theme === 'dark' ? 'dark' : 'liberty'}`;
}
