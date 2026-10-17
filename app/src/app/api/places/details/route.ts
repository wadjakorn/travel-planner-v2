import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { allowPlacesRequest } from '@/lib/places/rate-limit';
import { getPlaceDetail } from '@/lib/places/search';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await allowPlacesRequest(session.user.id))) return NextResponse.json({ place: null });
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const lang = req.nextUrl.searchParams.get('lang') === 'th' ? 'th' : 'en';
  return NextResponse.json({ place: id ? await getPlaceDetail(id, lang) : null });
}
