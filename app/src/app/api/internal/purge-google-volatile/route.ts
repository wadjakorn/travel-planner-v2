// Cron target: purge Google rating/reviews/hours older than 30 days
// (TP-0047, see lib/places/google-sync.ts). Runs in both MAPS_PROVIDER modes.
//
// Scheduled in vercel.json. Vercel signs cron invocations with
// `Authorization: Bearer $CRON_SECRET`; when CRON_SECRET is unset the route
// refuses rather than running open.

import { NextResponse, type NextRequest } from 'next/server';
import { purgeExpiredVolatile } from '@/lib/services/google-sync-service';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  return NextResponse.json(await purgeExpiredVolatile(new Date()));
}
