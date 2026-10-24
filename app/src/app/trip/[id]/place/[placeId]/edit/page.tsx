// /trip/[id]/place/[placeId]/edit — render the edit-place form pre-filled.

import { redirect, notFound } from "next/navigation";
import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { canWrite, getTripRole } from "@/lib/trip-access";
import { db } from "@/db";
import { days, places, trips } from "@/db/schema";
import { PlaceForm } from "@/components/place-form";
import { updatePlaceAction } from "@/app/actions/places";
import { MAPS_CONFIG } from "@/lib/maps/config";
import { isGooglePlaceId } from "@/lib/places/place-id";
import { GoogleRefreshButton } from "@/components/google-refresh-button";
import { formBaseJson, visibleVolatile } from "@/lib/places/google-sync";

export const metadata: Metadata = { title: "Edit place" };

type Params = Promise<{ id: string; placeId: string }>;

export default async function EditPlacePage({ params }: { params: Params }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const { id: tripId, placeId } = await params;

  const row = await db
    .select({
      place: places,
      ownerId: trips.ownerId,
      dayTripId: days.tripId,
    })
    .from(places)
    .innerJoin(days, eq(days.id, places.dayId))
    .innerJoin(trips, eq(trips.id, days.tripId))
    .where(eq(places.id, placeId))
    .limit(1);

  const r = row[0];
  if (!r || r.dayTripId !== tripId) notFound();
  if (!canWrite(await getTripRole(tripId, session.user.id))) notFound();

  // Expired Google rating/hours render blank. formBase = what this form
  // renders, so a save writes only the fields the user changed.
  const p = visibleVolatile(r.place, new Date());

  const canRefresh =
    MAPS_CONFIG.googlePlaces &&
    isGooglePlaceId(p.placeIdExternal) &&
    p.googleStatus !== "NOT_FOUND" &&
    p.googleStatus !== "INVALID";

  return (
    <>
      {canRefresh && <GoogleRefreshButton placeId={placeId} tripId={tripId} />}
      <PlaceForm
        key={String(p.googleSyncedAt?.getTime() ?? 0)}
        mode="edit"
        action={updatePlaceAction}
        hidden={{ placeId, formBase: formBaseJson(p) }}
        initial={{
          kind: p.kind,
          name: p.name,
          category: p.category,
          rating: p.rating,
          reviews: p.reviews,
          time: p.time,
          duration: p.duration,
          price: p.price,
          address: p.address,
          phone: p.phone,
          website: p.website,
          hours: p.hours,
          tags: p.tags,
          thumb: p.thumb,
          note: p.note,
          lat: p.lat,
          lng: p.lng,
          placeIdExternal: p.placeIdExternal,
        }}
        cancelHref={`/trip/${tripId}`}
      />
    </>
  );
}
