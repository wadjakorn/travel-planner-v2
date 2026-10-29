import Link from 'next/link';
import { Button, Card } from '@/components/ui';
import { tServer } from '@/lib/i18n';

export default async function NotFound() {
  const t = await tServer();
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center">
      <Card className="p-8 shadow-[var(--shadow-sm)]">
        <div className="text-xs uppercase tracking-wide text-muted">404</div>
        <h1 className="mt-1 text-xl font-semibold text-foreground">{t('err_not_found_title')}</h1>
        <p className="mt-2 text-sm text-muted">
          {t('err_not_found_body')}
        </p>
        <Button asChild className="mt-5 rounded-full">
          <Link href="/">{t('err_back_to_trips')}</Link>
        </Button>
      </Card>
    </main>
  );
}
