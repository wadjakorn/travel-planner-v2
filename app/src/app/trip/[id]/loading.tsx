import { ItinerarySkeleton } from '@/components/skeletons';

export default function TripLoading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-8">
      <ItinerarySkeleton />
    </main>
  );
}
