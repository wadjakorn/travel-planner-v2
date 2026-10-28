import { PageSkeleton } from '@/components/skeletons';

// Fallback for routes without a closer loading.tsx (home, trip pages and
// their sub-pages each have their own).
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10">
      <PageSkeleton />
    </main>
  );
}
