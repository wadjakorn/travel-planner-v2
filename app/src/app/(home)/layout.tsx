// Home chrome. The Header lives here rather than in page.tsx so it stays
// mounted while (home)/loading.tsx streams the trip grid skeleton — before,
// the whole page (header included) blanked out on every navigation home.
// Signed-out visitors get the public landing, which has its own top bar.

import { auth } from '@/lib/auth';
import { Header } from '@/components/header';

export default async function HomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = (await auth())?.user;
  return (
    <>
      {user?.id ? <Header user={user} /> : null}
      {children}
    </>
  );
}
