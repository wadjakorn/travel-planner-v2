// Public landing for signed-out visitors (TP-0031, plan §3.3).
//
// Before this, `/` redirected anonymous visitors straight to /sign-in, so the
// production URL was unshareable — a link posted anywhere previewed as a bare
// sign-in wall. This page is what the real URL now shows: what the app is,
// what it looks like, and an honest note that sign-up is invite-only.
//
// The product shots in src/assets/landing are real screenshots of the seeded
// demo trip (lib/seed-trip.ts), captured with Playwright at 2x. Re-shoot them
// when the trip UI changes enough that the landing would misrepresent it
// (TP-0069). A live read-only /demo trip is a separate follow-up (plan §3.3).

import Image, { getImageProps } from 'next/image';
import { preload } from 'react-dom';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { MapPin, Route, Wallet, Share } from '@/components/icons';
import desktopItinerary from '@/assets/landing/desktop-itinerary.jpg';
import mobileItinerary from '@/assets/landing/mobile-itinerary.jpg';
import desktopCalendar from '@/assets/landing/desktop-calendar.jpg';
import desktopBudget from '@/assets/landing/desktop-budget.jpg';
import styles from './public-landing.module.css';

// Hero shots and how they load (TP-0072). On mobile the phone shot is the
// LCP, so it is preloaded at high priority. The desktop shot only shows from
// md up: preloading it unconditionally made every phone download ~60KB it
// never displays, competing with the real LCP. Instead it is lazy (a hidden
// lazy image is never fetched) and preloaded with a media query, so desktop
// still starts it from <head>. getImageProps yields the same srcset as the
// <Image> below, so the browser reuses the preloaded response.
const DESKTOP_SHOT_SIZES = '(min-width: 1200px) 1072px, 90vw';
const DESKTOP_SHOT_MEDIA = '(min-width: 768px)';

function preloadDesktopShot() {
  const { props } = getImageProps({
    src: desktopItinerary,
    alt: '',
    sizes: DESKTOP_SHOT_SIZES,
  });
  preload(props.src, {
    as: 'image',
    imageSrcSet: props.srcSet,
    imageSizes: props.sizes,
    media: DESKTOP_SHOT_MEDIA,
    fetchPriority: 'high',
  });
}

const FEATURES = [
  {
    title: 'Itinerary',
    body: 'Day-by-day plan. Drag places into order, keep notes where you need them.',
    Icon: MapPin,
  },
  {
    title: 'Map & routes',
    body: 'Every stop on one map, with real travel times between them.',
    Icon: Route,
  },
  {
    title: 'Bookings & budget',
    body: 'Hotels, transport and expenses in the same place as the plan.',
    Icon: Wallet,
  },
  {
    title: 'Together',
    body: 'Invite the people coming with you and edit the trip as a group.',
    Icon: Share,
  },
];

const GALLERY = [
  {
    src: desktopCalendar,
    title: 'See the whole trip at a glance',
    body: 'Days, stays and flights laid out on a calendar.',
    alt: 'Calendar view of a five-day trip with each day and hotel stay marked',
  },
  {
    src: desktopBudget,
    title: 'Know what it all costs',
    body: 'Spending by category, per day and per person.',
    alt: 'Budget view showing total spent and a breakdown by transport, hotels and food',
  },
];

export function PublicLanding() {
  preloadDesktopShot();
  return (
    <div className={styles.page}>
      <div className={styles.bg} aria-hidden>
        <div className={`${styles.blob} ${styles.b1}`} />
        <div className={`${styles.blob} ${styles.b2}`} />
        <div className={`${styles.blob} ${styles.b3}`} />
      </div>

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-5 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="" width={32} height={32} className="rounded-lg" />
          <span className="text-base font-semibold tracking-tight text-foreground">
            Traver Planel
          </span>
        </Link>
        <Button asChild variant="outline" size="sm" className="rounded-full">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-6xl px-6 pt-10 text-center sm:px-10 sm:pt-16">
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-6xl">
            Plan trips, share with friends, get there.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted">
            One place for the itinerary, the map, the hotels and what it all
            costs — instead of six chat threads and a spreadsheet.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Button asChild size="lg" className="rounded-full px-8">
              <Link href="/sign-in">Sign in to start planning</Link>
            </Button>
            <p className="text-sm text-muted">
              Invite-only for now. Got an invite link? Open it to join.
            </p>
          </div>
        </section>

        <section className="mx-auto mt-14 max-w-6xl px-6 sm:mt-16 sm:px-10">
          <div className="relative">
            <figure className={`${styles.browser} hidden md:block`}>
              <div className={styles.browserBar} aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <Image
                src={desktopItinerary}
                alt="A five-day Tokyo and Mount Fuji trip: the day's stops listed on the left, pinned on a map on the right"
                loading="lazy"
                placeholder="blur"
                sizes={DESKTOP_SHOT_SIZES}
                className="block h-auto w-full"
              />
            </figure>
            <figure className={`${styles.phone} mx-auto md:absolute md:-bottom-10 md:-right-4 md:mx-0 lg:-right-10`}>
              <Image
                src={mobileItinerary}
                alt="The same trip's itinerary on a phone"
                preload
                fetchPriority="high"
                placeholder="blur"
                sizes="(min-width: 768px) 220px, 280px"
                className="block h-auto w-full"
              />
            </figure>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-6xl px-6 sm:mt-28 sm:px-10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ title, body, Icon }) => (
              <div
                key={title}
                className="flex gap-4 rounded-2xl border border-border bg-surface/80 p-4 backdrop-blur sm:block sm:p-5"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand">
                  <Icon width={20} height={20} aria-hidden />
                </span>
                <div>
                  <h2 className="text-base font-semibold text-foreground sm:mt-4">{title}</h2>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-16 grid max-w-6xl gap-6 px-6 sm:px-10 md:grid-cols-2">
          {GALLERY.map((g) => (
            <figure key={g.title}>
              <div className={styles.shot}>
                <Image
                  src={g.src}
                  alt={g.alt}
                  placeholder="blur"
                  sizes="(min-width: 768px) 520px, 90vw"
                  className="block aspect-[16/10] h-auto w-full object-cover object-left-top"
                />
              </div>
              <figcaption className="mt-4">
                <div className="font-semibold text-foreground">{g.title}</div>
                <div className="text-sm text-muted">{g.body}</div>
              </figcaption>
            </figure>
          ))}
        </section>
      </main>

      <footer className="relative mx-auto mt-24 flex max-w-6xl flex-col items-center justify-between gap-3 border-t border-border px-6 py-8 text-sm text-muted sm:flex-row sm:px-10">
        <span>Traver Planel</span>
        <span>
          Already have an account?{' '}
          <Link href="/sign-in" className="font-medium text-brand underline-offset-4 hover:underline">
            Sign in
          </Link>
        </span>
      </footer>
    </div>
  );
}
