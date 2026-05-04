// /trip/[id]/notes — Phase 6 Notes & checklists view.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import { trips } from '@/db/schema';
import { Header } from '@/components/header';
import { TripNav } from '@/components/trip-nav';
import { NotesView } from '@/components/notes-view';
import { loadNotesForTrip } from '@/lib/note-queries';

export const metadata: Metadata = { title: 'Notes' };

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ n?: string }>;

export default async function NotesPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect('/sign-in');

  const { id: tripId } = await params;
  const { n: activeId } = await searchParams;

  const tripRow = await db
    .select()
    .from(trips)
    .where(eq(trips.id, tripId))
    .limit(1);
  const trip = tripRow[0];
  if (!trip || trip.ownerId !== user.id) notFound();

  const notes = (await loadNotesForTrip(tripId, user.id)) ?? [];

  return (
    <>
      <Header
        user={user}
        tripTitle={trip.title}
        tripUpdatedAt={trip.updatedAt.toISOString()}
      />
      <TripNav tripId={tripId} active="notes" />
      <NotesView tripId={tripId} notes={notes} activeId={activeId ?? null} />
    </>
  );
}
