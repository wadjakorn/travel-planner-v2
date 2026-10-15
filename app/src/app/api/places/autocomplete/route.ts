import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { allowPlacesRequest } from '@/lib/places/rate-limit';
import { searchPlaces } from '@/lib/places/search';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await allowPlacesRequest(session.user.id))) return NextResponse.json({ results: [] });
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 120);
  if (q.length < 2) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await searchPlaces(q) });
}
