// Sign-in seeds the `lang` cookie from the account's saved Language, but only
// on a device that has no valid `lang` cookie yet (i18n P6, TP-0109).
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SignInEvent = (m: { user: { id?: string } }) => Promise<void>;

const h = vi.hoisted(() => ({
  config: null as null | { events: { signIn: SignInEvent } },
  cookie: undefined as string | undefined,
  set: vi.fn(),
  rows: [] as { lang: 'en' | 'th' }[],
  queried: vi.fn(),
}));

vi.mock('next-auth', () => ({
  default: (config: typeof h.config) => {
    h.config = config;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));
vi.mock('next-auth/providers/google', () => ({ default: () => ({ id: 'google' }) }));
vi.mock('next-auth/providers/nodemailer', () => ({ default: () => ({ id: 'nodemailer' }) }));
vi.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: () => ({}) }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'lang' && h.cookie !== undefined ? { value: h.cookie } : undefined),
    set: h.set,
  }),
}));
vi.mock('@/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: async () => {
      h.queried();
      return h.rows;
    },
  };
  return { db: { select: () => chain }, dbNode: {} };
});

await import('./auth');
const signIn = (id = 'u1') => h.config!.events.signIn({ user: { id } });

describe('events.signIn lang seeding', () => {
  beforeEach(() => {
    h.cookie = undefined;
    h.rows = [];
    h.set.mockClear();
    h.queried.mockClear();
  });

  it('copies the saved Language onto a device with no lang cookie', async () => {
    h.rows = [{ lang: 'th' }];
    await signIn();
    expect(h.set).toHaveBeenCalledWith('lang', 'th', { path: '/', maxAge: 60 * 60 * 24 * 365 });
  });

  it("keeps this device's own pick (landing switch / earlier save), without a DB read", async () => {
    h.cookie = 'th';
    h.rows = [{ lang: 'en' }];
    await signIn();
    expect(h.set).not.toHaveBeenCalled();
    expect(h.queried).not.toHaveBeenCalled();
  });

  it('treats an invalid cookie as absent', async () => {
    h.cookie = 'xx';
    h.rows = [{ lang: 'en' }];
    await signIn();
    expect(h.set).toHaveBeenCalledWith('lang', 'en', expect.anything());
  });

  it('leaves the cookie alone when the account never saved settings', async () => {
    await signIn();
    expect(h.set).not.toHaveBeenCalled();
  });
});
