import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { allowPlacesRequest } from '@/lib/places/rate-limit';
import { getPlacePhotoRef } from '@/lib/places/search';

export const runtime = 'nodejs';

// Pin card (TP-0064): a fresh first-photo ref for an added Google place. Photo
// names must not be cached (Google ToS), so this response is never cached.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const noStore = { headers: { 'Cache-Control': 'no-store' } };
  if (!(await allowPlacesRequest(session.user.id))) return NextResponse.json({ photo: null }, noStore);
  const photo = await getPlacePhotoRef(req.nextUrl.searchParams.get('id') ?? '');
  return NextResponse.json({ photo }, noStore);
}
