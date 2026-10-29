// /trip/[id]/notes — Phase 6 Notes & checklists view.

import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { getTripRole, canWrite } from '@/lib/trip-access';
import { NotesView } from '@/components/notes-view';
import { loadNotesForTrip } from '@/lib/note-queries';
import { loadTripBasic } from '@/lib/trip-queries';
import { tServer } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const t = await tServer();
  return { title: t('notes') };
}

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

  const notes = await loadNotesForTrip(tripId);

  return (
    <>
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
