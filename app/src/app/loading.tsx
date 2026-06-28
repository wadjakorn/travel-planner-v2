import { TripGridSkeleton } from '@/components/skeletons';

export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <TripGridSkeleton />
    </main>
  );
}
