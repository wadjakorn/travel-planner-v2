import { TripGridSkeleton } from '@/components/skeletons';

export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10 sm:px-10">
      <TripGridSkeleton />
    </main>
  );
}
