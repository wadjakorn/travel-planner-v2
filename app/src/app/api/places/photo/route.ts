import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { allowPlacesRequest } from '@/lib/places/rate-limit';
import { getPlacePhotoUri } from '@/lib/places/search';

export const runtime = 'nodejs';

// Map-preview card image: resolves a Google Place Photo name server-side (the
// API key never reaches the browser) and redirects to the short-lived image URL.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await allowPlacesRequest(session.user.id))) return new NextResponse(null, { status: 404 });
  const uri = await getPlacePhotoUri(req.nextUrl.searchParams.get('name') ?? '');
  if (!uri) return new NextResponse(null, { status: 404 });
  return new NextResponse(null, {
    status: 302,
    headers: { Location: uri, 'Cache-Control': 'private, max-age=3600' },
  });
}
