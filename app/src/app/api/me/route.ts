// GET /api/me -> { user: { id, name, email, image } | null }
//
// Source of truth for "who is signed in". Used by client components that
// can't `await auth()` directly.

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  return NextResponse.json({ user: session?.user ?? null });
}
