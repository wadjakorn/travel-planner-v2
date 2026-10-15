import { NextResponse, type NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { getPlaceDetail } from '@/lib/places/search';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id') ?? '';
  const lang = req.nextUrl.searchParams.get('lang') === 'th' ? 'th' : 'en';
  return NextResponse.json({ place: id ? await getPlaceDetail(id, lang) : null });
}
