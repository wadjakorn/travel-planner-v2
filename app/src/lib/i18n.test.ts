import { afterEach, describe, expect, it, vi } from 'vitest';
import en from '@/messages/en.json';

// getLang() reads the request; stand in for next/headers.
function mockRequest({ cookie, acceptLanguage }: { cookie?: string; acceptLanguage?: string } = {}) {
  vi.doMock('next/headers', () => ({
    cookies: async () => ({ get: (n: string) => (n === 'lang' && cookie ? { value: cookie } : undefined) }),
    headers: async () => ({ get: (n: string) => (n === 'accept-language' ? acceptLanguage ?? null : null) }),
  }));
}

async function freshI18n(request?: Parameters<typeof mockRequest>[0]) {
  vi.resetModules();
  mockRequest(request);
  return import('./i18n');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock('@/messages/th.json');
  vi.doUnmock('next/headers');
});

describe('getLang (i18n P6)', () => {
  it('follows the lang cookie over Accept-Language', async () => {
    const { getLang, tServer } = await freshI18n({ cookie: 'th', acceptLanguage: 'en-US' });
    expect(await getLang()).toBe('th');
    expect((await tServer())('language')).not.toBe(en.language);
  });

  it('falls back to Accept-Language, then English', async () => {
    expect(await (await freshI18n({ acceptLanguage: 'th-TH,th;q=0.9' })).getLang()).toBe('th');
    expect(await (await freshI18n()).getLang()).toBe('en');
  });

  it('I18N_FORCE_EN=1 pins English whatever the request says', async () => {
    vi.stubEnv('I18N_FORCE_EN', '1');
    const { getLang, tServer } = await freshI18n({ cookie: 'th', acceptLanguage: 'th' });
    expect(await getLang()).toBe('en');
    expect((await tServer())('language')).toBe(en.language);
  });
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
