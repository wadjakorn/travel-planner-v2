// Loading skeletons, one per destination. Layouts keep the chrome (header,
// trip rail, map) mounted, so each skeleton only stands in for the page body
// and mirrors that body's real box — same container, same widths — to avoid
// layout shift when the page streams in. The wrapper carries aria-busy + an
// sr-only label so assistive tech announces the pending state (the bars
// themselves are aria-hidden) and fades in late so fast navigations never
// flash a skeleton.

import { Skeleton } from '@/components/ui';
import { PageContainer } from '@/components/ui/page-container';
import { TRIP_ASIDE_CLASS } from '@/components/trip-aside-class';
// Form routes: borrow each form's own shell classes so the placeholder box is
// the real box. The hotel, transport and expense modules share one identical
// wrap/panel/head/body/foot shell, so hotel's stands in for all three.
import panelStyles from '@/components/hotel-form.module.css';
import pickerStyles from '@/components/place-search-picker.module.css';
import placeFormStyles from '@/components/place-form.module.css';
import signInStyles from '@/app/sign-in/sign-in.module.css';

function LoadingRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={className ? `tp-loading-in ${className}` : 'tp-loading-in'}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Eyebrow + title + meta line, with optional action pills on the right. */
function PageHeaderSkeleton({ actions = 0 }: { actions?: number }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Skeleton className="h-3 w-20" />
        <Skeleton className="mt-2.5 h-8 w-44" />
        <Skeleton className="mt-2.5 h-3.5 w-56 max-w-full" />
      </div>
      {actions > 0 ? (
        <div className="hidden gap-2 sm:flex">
          {Array.from({ length: actions }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-28 rounded-full" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Root fallback for pages without their own skeleton. */
export function PageSkeleton() {
  return (
    <LoadingRegion label="Loading">
      <PageHeaderSkeleton />
      <div className="mt-8 space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </LoadingRegion>
  );
}

/** Home trip grid — header bar + responsive card grid. */
export function TripGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    // tp-session-only: `/` serves visitors the landing, not a trip grid.
    <LoadingRegion label="Loading trips" className="tp-session-only">
      {/* Mirror the real page: title + New-trip button, then search/sort row. */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-10 w-32 rounded-full" />
      </div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-10 w-full rounded-md sm:max-w-xs sm:flex-1" />
        <Skeleton className="h-10 w-full rounded-md sm:w-44" />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-border bg-surface"
          >
            <Skeleton className="h-36 rounded-none" />
            <div className="space-y-2 px-4 pb-4 pt-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

/** Trip itinerary column — cover, open day timeline, collapsed days. */
export function ItinerarySkeleton({ stops = 3 }: { stops?: number }) {
  return (
    <LoadingRegion label="Loading itinerary" className={TRIP_ASIDE_CLASS}>
      {/* TripCover */}
      <div className="px-6 py-[18px]">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-2.5 h-7 w-52" />
        <Skeleton className="mt-2 h-3.5 w-56" />
      </div>
      <div className="h-8 border-y border-border bg-surface-2" />

      {/* Open day */}
      <div className="px-5 pt-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-14" />
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="ml-auto h-7 w-20" />
        </div>
        <div className="mt-6 pl-5">
          {Array.from({ length: stops }).map((_, i) => (
            <div key={i}>
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                <Skeleton className="h-12 w-12 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </div>
              {i < stops - 1 ? (
                <div className="flex items-center gap-3 py-3">
                  <div className="ml-[13px] h-8 border-l-2 border-dashed border-border" />
                  <Skeleton className="ml-6 h-8 w-40 rounded-full" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-dashed border-border p-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>

      {/* Collapsed days */}
      <div className="mt-8 space-y-3 px-5">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    </LoadingRegion>
  );
}

/** Budget — header + actions, notice, total hero, category grid. */
export function BudgetSkeleton() {
  return (
    <LoadingRegion label="Loading budget" className="flex-1">
      <PageContainer>
        <div className="pt-6 sm:px-4">
          <PageHeaderSkeleton actions={3} />
          <Skeleton className="mt-6 h-11 w-full rounded-xl" />
          <Skeleton className="mt-6 h-48 w-full rounded-3xl" />
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4"
              >
                <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
                <div className="flex-1 space-y-2.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3.5 w-10" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </PageContainer>
    </LoadingRegion>
  );
}

/** Bookings — header strip, filter tabs, a date group of tickets. */
export function BookingsSkeleton() {
  return (
    <LoadingRegion label="Loading bookings" className="tp-on-muted min-h-full flex-1 bg-surface-2">
      {/* Same 52rem column as BookingsView. `!` because Tailwind utilities sit
          in a cascade layer and the unlayered .container max-width would win. */}
      <PageContainer className="max-w-[52rem]!">
        <div className="border-b border-border bg-surface px-[18px] pb-3 pt-[22px]">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="mt-2.5 h-7 w-36" />
          <Skeleton className="mt-2.5 h-3 w-56 max-w-full" />
        </div>
        <div className="mx-[18px] mt-4 flex h-12 items-center rounded-xl border border-border p-1.5">
          <div className="h-full w-1/3 rounded-lg bg-surface" />
        </div>
        <div className="px-[18px]">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="mt-7">
              <Skeleton className="h-3 w-24" />
              <div className="mt-4 rounded-2xl border border-border bg-surface p-4">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-3.5 w-24" />
                </div>
                <Skeleton className="mt-3 h-6 w-48" />
                <div className="mt-6 border-t border-dashed border-border pt-3">
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </PageContainer>
    </LoadingRegion>
  );
}

/** Calendar — header, Trip | Month toolbar, trip-range day columns. */
export function CalendarSkeleton() {
  return (
    <LoadingRegion label="Loading calendar" className="flex-1">
      <PageContainer className="py-5 sm:py-6">
        <div className="mb-4">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-2 h-7 w-32" />
          <Skeleton className="mt-2 h-3.5 w-44" />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2">
            <Skeleton className="h-10 w-16 rounded-full" />
            <Skeleton className="h-10 w-20 rounded-full" />
            <Skeleton className="ml-auto hidden h-10 w-24 rounded-full sm:block" />
          </div>
          {/* One column per trip day: stacked on phones, a strip from md up
              (calendar-trip-range). */}
          <div className="flex flex-col gap-2 md:grid md:auto-cols-[minmax(11rem,1fr)] md:grid-flow-col">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="space-y-2 rounded-xl border border-border p-3 md:h-[260px]"
              >
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-9 w-full rounded-lg" />
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            ))}
          </div>
        </div>
      </PageContainer>
    </LoadingRegion>
  );
}

/** Trip settings — intro, then the folio card (section nav + form). */
export function SettingsSkeleton() {
  return (
    <LoadingRegion
      label="Loading settings"
      className="mx-auto min-w-0 max-w-5xl flex-1 px-6 py-10 sm:px-10"
    >
      <Skeleton className="h-3 w-12" />
      <Skeleton className="mt-3 h-10 w-64 max-w-full" />
      <Skeleton className="mt-3 h-4 w-[30rem] max-w-full" />
      <div className="mt-8 grid overflow-hidden rounded-2xl border border-border md:grid-cols-[224px_1fr]">
        <div className="tp-on-muted hidden space-y-5 border-r border-border bg-surface-2 p-5 md:block">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-5 w-32" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-36" />
          ))}
        </div>
        <div className="space-y-4 p-6 md:p-8">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="!mt-8 h-4 w-24" />
          <Skeleton className="h-10 w-full rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-full rounded-full" />
          <div className="flex justify-end">
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}

/** Label + input placeholder, the unit every form below is built from. */
function FieldSkeleton({ label = 'w-16', className }: { label?: string; className?: string }) {
  return (
    <div className={className}>
      <Skeleton className={`h-3 ${label}`} />
      <Skeleton className="mt-2 h-11 w-full rounded-xl" />
    </div>
  );
}

/** Hotel / transport / expense add+edit — header, field groups, footer. */
export function FormPanelSkeleton({ label = 'Loading form' }: { label?: string }) {
  return (
    <LoadingRegion label={label} className={panelStyles.wrap}>
      <div className={panelStyles.panel}>
        <div className={panelStyles.head}>
          <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="ml-auto h-8 w-8 rounded-full" />
        </div>
        <div className={`${panelStyles.body} space-y-5`}>
          <FieldSkeleton label="w-12" />
          <div className="grid grid-cols-2 gap-3">
            <FieldSkeleton label="w-10" />
            <FieldSkeleton label="w-10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldSkeleton label="w-10" />
            <FieldSkeleton label="w-10" />
          </div>
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
        <div className={panelStyles.foot}>
          <Skeleton className="ml-auto h-5 w-14" />
          <Skeleton className="h-10 w-32 rounded-full" />
        </div>
      </div>
    </LoadingRegion>
  );
}

/** Add place — the search box and its Manual add / Cancel links. */
export function PlaceSearchSkeleton() {
  return (
    <LoadingRegion label="Loading place search" className={pickerStyles.wrap}>
      <Skeleton className="h-[54px] w-full rounded-2xl" />
      <div className="mt-3 flex justify-between">
        <Skeleton className="h-3.5 w-20" />
        <Skeleton className="h-3.5 w-12" />
      </div>
    </LoadingRegion>
  );
}

/** Edit place — the frosted card over the sign-in backdrop. */
export function PlaceFormSkeleton() {
  return (
    <LoadingRegion label="Loading place" className={signInStyles.wrap}>
      <div className={signInStyles.bg} aria-hidden>
        <div className={`${signInStyles.blob} ${signInStyles.b1}`} />
        <div className={`${signInStyles.blob} ${signInStyles.b2}`} />
        <div className={`${signInStyles.blob} ${signInStyles.b3}`} />
      </div>
      {/* The real form is taller than any screen, so its card always sits at
          the max-height cap; match it or the card jumps when the form lands. */}
      <div
        className={`${signInStyles.card} ${placeFormStyles.card} h-[calc(100dvh-32px)] !overflow-hidden`}
      >
        <div className={signInStyles.brand}>
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-6 w-28" />
        </div>
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <FieldSkeleton label="w-10" />
            <FieldSkeleton label="w-10" />
          </div>
          <FieldSkeleton label="w-12" />
          <FieldSkeleton label="w-16" />
          <div className="grid grid-cols-2 gap-3">
            <FieldSkeleton label="w-10" />
            <FieldSkeleton label="w-14" />
          </div>
          <FieldSkeleton label="w-14" />
          <div className="grid grid-cols-2 gap-3">
            <FieldSkeleton label="w-12" />
            <FieldSkeleton label="w-14" />
          </div>
          <FieldSkeleton label="w-12" />
        </div>
      </div>
    </LoadingRegion>
  );
}

/** Notes — header + actions, list column, open note. */
export function NotesSkeleton() {
  return (
    <LoadingRegion label="Loading notes" className="flex-1">
      <div className="px-6 py-6">
        <div className="mb-4">
          <PageHeaderSkeleton actions={2} />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
          <div className="space-y-6 border-r border-border pr-4">
            {[2, 2].map((n, g) => (
              <div key={g} className="space-y-3">
                <Skeleton className="h-3 w-20" />
                {Array.from({ length: n }).map((_, i) => (
                  <div key={i} className="space-y-1.5 px-2 py-1">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="min-h-[400px] rounded-2xl border border-border p-5">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="mt-2 h-3 w-48" />
            <div className="mt-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-4 w-56 max-w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </LoadingRegion>
  );
}
