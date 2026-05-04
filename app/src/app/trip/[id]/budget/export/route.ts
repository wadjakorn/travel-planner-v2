// CSV download endpoint for a trip's expenses.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getTripRole } from '@/lib/trip-access';
import { exportExpensesCsv } from '@/app/actions/expenses';

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

  const csv = await exportExpensesCsv(tripId);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="expenses-${tripId.slice(0, 8)}.csv"`,
    },
  });
}
