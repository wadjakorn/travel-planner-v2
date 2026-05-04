// /trip/[id]/notes — Phase 6 Notes & checklists view.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { TripRail } from '@/components/trip-rail';
import { NotesView } from '@/components/notes-view';
import { loadNotesForTrip } from '@/lib/note-queries';
import { loadTripBasic, loadBookingCounts } from '@/lib/trip-queries';

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

  const trip = await loadTripBasic(tripId);
  if (!trip) notFound();
  const role = await getTripRole(trip.id, user.id);
  if (!role) notFound();
  const canEdit = canWrite(role);

  const [notes, counts] = await Promise.all([
    loadNotesForTrip(tripId),
    loadBookingCounts(tripId),
  ]);

  return (
    <>
      <TripRail tripId={tripId} active="notes" counts={counts} />
      <div className="flex-1">
        <NotesView
          tripId={tripId}
          notes={notes}
          activeId={activeId ?? null}
          canEdit={canEdit}
        />
      </div>
    </>
  );
}
