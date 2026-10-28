import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { allowPlacesRequest } from '@/lib/places/rate-limit';
import { getPlacePhotoRef } from '@/lib/places/search';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

// Pin card (TP-0064): a fresh first-photo ref for an added Google place. Photo
// names must not be cached (Google ToS), so nothing here is cacheable. 200
// `{ photo }` is a definite answer (photo may be null); 503 means "unavailable
// now" (limit, budget, breaker, timeout) so the client retries later.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await allowPlacesRequest(session.user.id))) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  const r = await getPlacePhotoRef(req.nextUrl.searchParams.get('id') ?? '');
  if (!r) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ photo: r.photo }, { headers: NO_STORE });
}
