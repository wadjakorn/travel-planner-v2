import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { extractGmapsUrl } from '@/lib/places/gmaps-link';
import { allowPlacesRequest } from '@/lib/places/rate-limit';
import { searchPlaces, suggestFromLink } from '@/lib/places/search';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await allowPlacesRequest(session.user.id))) return NextResponse.json({ results: [], linkError: null });
  const rawQ = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 4096);
  const link = extractGmapsUrl(rawQ);
  if (link) return NextResponse.json(await suggestFromLink(link));
  const q = rawQ.slice(0, 120);
  if (q.length < 2) return NextResponse.json({ results: [], linkError: null });
  return NextResponse.json({ results: await searchPlaces(q), linkError: null });
}
