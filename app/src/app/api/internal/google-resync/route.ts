// Cron target: daily re-sync of Google place data (TP-0049, see
// lib/services/google-sync-service.ts). A no-op ('disabled') in open mode.
//
// Scheduled in vercel.json. Vercel signs cron invocations with
// `Authorization: Bearer $CRON_SECRET`; when CRON_SECRET is unset the route
// refuses rather than running open.

import { NextResponse, type NextRequest } from 'next/server';
import { runGoogleResync } from '@/lib/services/google-sync-service';

export const dynamic = 'force-dynamic';
// Hobby maximum. Rows run sequentially: 20 x 3 s timeout worst case.
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    // Source is always 'cron'; never taken from the request.
    return NextResponse.json(await runGoogleResync({ source: 'cron' }));
  } catch (e) {
    console.error('google-resync failed:', e instanceof Error ? e.name : 'unknown');
    return NextResponse.json({ error: 'resync_failed' }, { status: 500 });
  }
}
