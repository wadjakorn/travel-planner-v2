import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="rounded-2xl border border-border bg-surface p-8 shadow-[var(--shadow-sm)]">
        <div className="text-xs uppercase tracking-wide text-muted">404</div>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Not found</h1>
        <p className="mt-2 text-sm text-muted">
          That trip / page does not exist or you do not have access.
        </p>
        <Button asChild className="mt-5 rounded-full">
          <Link href="/">Back to trips</Link>
        </Button>
      </div>
    </main>
  );
}
