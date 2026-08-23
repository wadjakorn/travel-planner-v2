// Auth.js route handlers, plus a secondary rate limit on direct HTTP hits to
// the sign-in POST.
//
// Secondary, because the app's own sign-in form never reaches here: its
// buttons are server actions calling Auth() in-process, and those are limited
// at the source in src/app/sign-in/page.tsx. This wrapper catches scripted
// POSTs straight at the endpoint.
//
// /api/auth/callback/* is deliberately NOT limited: a 429 there aborts an
// in-flight OAuth round trip for a user who already authenticated at Google,
// and the callback is not the flood surface — the signin POST is.
// See docs/plans/invite-only-access.md §3.4.

import type { NextRequest } from 'next/server';
import { handlers } from '@/lib/auth';
import { consumeAnonBudget } from '@/lib/anon-rate-limit';

export const { GET } = handlers;

export async function POST(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/api/auth/signin')) {
    const result = await consumeAnonBudget('signin', req.headers);
    if (!result.ok) {
      return new Response('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': String(result.retryAfter) },
      });
    }
  }
  return handlers.POST(req);
}
