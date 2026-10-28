import { TripGridSkeleton } from '@/components/skeletons';

export default function HomeLoading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10">
      <TripGridSkeleton />
    </main>
  );
}
