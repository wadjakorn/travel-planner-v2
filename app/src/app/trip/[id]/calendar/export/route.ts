// .ics download endpoint for a trip's calendar.
// Auth shape mirrors budget/export: 401 without a session, 404 for non-members.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTripRole } from '@/lib/trip-access';
import { exportTripIcs } from '@/lib/ics-queries';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id: tripId } = await params;
  if (!(await getTripRole(tripId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ics = await exportTripIcs(tripId);
  if (ics === null) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="trip-${tripId.slice(0, 8)}.ics"`,
      // Per-user document behind auth — never let an intermediary hold a copy.
      'Cache-Control': 'private, no-store',
    },
  });
}
