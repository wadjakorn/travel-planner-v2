import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { isValidPhotoName } from '@/lib/places/google';
import { allowPlacesRequest } from '@/lib/places/rate-limit';
import { getPlacePhotoUri } from '@/lib/places/search';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'no-store' };

// Map preview / pin card image: resolves a Google Place Photo name server-side
// (the API key never reaches the browser) to its short-lived image URL. JSON,
// never cached: photo names must not be stored (Google ToS). The client keeps
// the URL in memory for the page session, so a re-opened card is not re-billed.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const name = req.nextUrl.searchParams.get('name') ?? '';
  if (!isValidPhotoName(name)) return NextResponse.json({ error: 'bad_request' }, { status: 400, headers: NO_STORE });
  if (!(await allowPlacesRequest(session.user.id))) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  const uri = await getPlacePhotoUri(name);
  if (!uri) return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ uri }, { headers: NO_STORE });
}
