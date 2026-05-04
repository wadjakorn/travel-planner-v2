import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="text-xs uppercase tracking-wide text-zinc-500">404</div>
        <h1 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Not found
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          That trip / page does not exist or you do not have access.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Back to trips
        </Link>
      </div>
    </main>
  );
}
