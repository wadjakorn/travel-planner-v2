import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Neutralize Next's server-only marker so server modules import cleanly.
      'server-only': r('./test/stubs/server-only.ts'),
      '@': r('./src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Dummy connection strings so modules that import `@/db` load under unit
    // tests without a real database — the neon-http/postgres-js clients are
    // lazy and never connect. Integration tests inject their own client bound
    // to TEST_DATABASE_URL, so this placeholder never carries real traffic.
    env: {
      DATABASE_URL: 'postgres://user:pw@localhost:5432/placeholder',
      DATABASE_URL_UNPOOLED: 'postgres://user:pw@localhost:5432/placeholder',
    },
  },
});
