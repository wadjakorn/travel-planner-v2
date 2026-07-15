// /trip/[id]/transport — legacy route, now folded into the consolidated
// Bookings page. Kept as a redirect so existing links/bookmarks keep working.

import { redirect } from 'next/navigation';

type Params = Promise<{ id: string }>;

export default async function TransportPage({ params }: { params: Params }) {
  const { id } = await params;
  redirect(`/trip/${id}/bookings`);
}
