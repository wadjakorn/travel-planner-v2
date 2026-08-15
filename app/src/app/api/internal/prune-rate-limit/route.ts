// Cron target: drop stale rows from `rate_limit` (TP-0031).
//
// Its keys are hashed IPs, so unlike api_rate_limit (bounded by token count,
// FK-cascaded) the table grows without bound. Anything older than a day is
// long past every window and can never affect a decision.
//
// Scheduled in vercel.json. Vercel signs cron invocations with
// `Authorization: Bearer $CRON_SECRET`; when CRON_SECRET is unset the route
// refuses rather than running open.

import { NextResponse, type NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { rateLimits } from '@/db/schema';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const deleted = await db
    .delete(rateLimits)
    .where(sql`${rateLimits.windowStart} < now() - interval '1 day'`)
    .returning({ key: rateLimits.key });

  return NextResponse.json({ deleted: deleted.length });
}
