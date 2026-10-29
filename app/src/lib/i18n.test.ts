import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

async function freshI18n() {
  vi.resetModules();
  return import('./i18n');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('@/messages/th.json');
});

describe('server dictionaries', () => {
  it('a missing or empty Thai value falls back to English', async () => {
    vi.doMock('@/messages/th.json', () => ({ default: { save: '' } }));
    const { tFor } = await freshI18n();
    expect(tFor('th')('save')).toBe(en.save);
    expect(tFor('th')('saved_min_ago', { n: 3 })).toBe('3m ago');
  });

  it('I18N_PSEUDO=1 pseudo-localises DICTS, so tServer() sees it too', async () => {
    vi.stubEnv('I18N_PSEUDO', '1');
    vi.stubEnv('NODE_ENV', 'development');
    const { tServer, getDict } = await freshI18n();
    const t = await tServer();
    expect(t('save')).toMatch(/^⟦.*⟧$/);
    expect(t('saved_min_ago', { n: 3 })).toMatch(/^⟦3.*⟧$/);
    expect((await getDict()).save).toBe(t('save'));
  });

  it('pseudo-loc never runs in production', async () => {
    vi.stubEnv('I18N_PSEUDO', '1');
    vi.stubEnv('NODE_ENV', 'production');
    const { tServer } = await freshI18n();
    expect((await tServer())('save')).toBe(en.save);
  });
});
