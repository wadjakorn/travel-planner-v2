// Database client. Two drivers ship side-by-side:
//
// - `db` (default export) uses @neondatabase/serverless over HTTP. Works in
//   the Next.js Edge runtime, fast cold starts. Use this from route
//   handlers and server components.
// - `dbNode` uses postgres-js over TCP. Required by drizzle-kit migrations
//   and any long-lived Node script. Don't import from Edge code paths.
//
// Connection strings come from .env (DATABASE_URL pooled, DATABASE_URL_UNPOOLED
// direct). See ../../ARCHITECTURE.md "Environment variables".

import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import postgres from 'postgres';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is not set. See .env.example.');
}

export const db = drizzleNeon(neon(url), { schema });

const directUrl = process.env.DATABASE_URL_UNPOOLED ?? url;
export const dbNode = drizzlePg(postgres(directUrl, { prepare: false }), {
  schema,
});

export { schema };
