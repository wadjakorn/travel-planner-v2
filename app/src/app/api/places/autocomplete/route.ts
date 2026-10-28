import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { extractGmapsUrl } from '@/lib/places/gmaps-link';
import { allowPlacesRequest } from '@/lib/places/rate-limit';
import { searchPlaces, suggestFromLink } from '@/lib/places/search';
import { parseSessionParam } from '@/lib/places/session';
import { parseBiasParams } from '@/lib/places/bias';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await allowPlacesRequest(session.user.id))) return NextResponse.json({ results: [], linkError: null });
  const sess = parseSessionParam(req.nextUrl.searchParams.get('session'));
  const bias = parseBiasParams(req.nextUrl.searchParams);
  const deps = bias ? { session: sess, bias } : { session: sess };
  const rawQ = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 4096);
  const link = extractGmapsUrl(rawQ);
  if (link) return NextResponse.json(await suggestFromLink(link, deps));
  const q = rawQ.slice(0, 120);
  if (q.length < 2) return NextResponse.json({ results: [], linkError: null });
  return NextResponse.json({ results: await searchPlaces(q, deps), linkError: null });
}
