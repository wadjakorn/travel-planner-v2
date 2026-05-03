'use server';

// Demo-trip seed action. Ports the design/data.js mockup trip into the
// signed-in user's account. Called from the empty-state on the home
// page when a user has no trips. Phase 2B+ replaces the empty state
// with a real "Create trip" flow.

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { db } from '@/db';
import {
  trips,
  days,
  places,
  segments,
  hotelBookings,
  transportBookings,
  expenses,
} from '@/db/schema';
import { SEED_TRIP } from '@/lib/seed-trip';

export async function seedDemoTripAction() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error('Not authenticated');
  }

  const ownerId = session.user.id;

  // Insert the trip first so we can attach days to it.
  const [tripRow] = await db
    .insert(trips)
    .values({
      ownerId,
      title: SEED_TRIP.title,
      subtitle: SEED_TRIP.subtitle,
      startDate: SEED_TRIP.startDate,
      endDate: SEED_TRIP.endDate,
      cover: SEED_TRIP.cover,
      collaborators: SEED_TRIP.collaborators,
      recco: SEED_TRIP.recco,
    })
    .returning();

  // Insert days, then places + segments per day.
  for (const seedDay of SEED_TRIP.days) {
    const { places: dayPlaces, segments: daySegments, ...dayFields } = seedDay;
    const [dayRow] = await db
      .insert(days)
      .values({ ...dayFields, tripId: tripRow.id })
      .returning({ id: days.id });

    if (dayPlaces.length > 0) {
      await db
        .insert(places)
        .values(dayPlaces.map((p) => ({ ...p, dayId: dayRow.id })));
    }
    if (daySegments.length > 0) {
      await db
        .insert(segments)
        .values(daySegments.map((s) => ({ ...s, dayId: dayRow.id })));
    }
  }

  if (SEED_TRIP.hotels.length > 0) {
    await db
      .insert(hotelBookings)
      .values(SEED_TRIP.hotels.map((h) => ({ ...h, tripId: tripRow.id })));
  }
  if (SEED_TRIP.transport.length > 0) {
    await db
      .insert(transportBookings)
      .values(
        SEED_TRIP.transport.map((t) => ({ ...t, tripId: tripRow.id })),
      );
  }
  if (SEED_TRIP.expenses.length > 0) {
    await db.insert(expenses).values(
      SEED_TRIP.expenses.map((e) => ({
        ...e,
        tripId: tripRow.id,
        paidBy: ownerId,
      })),
    );
  }

  redirect('/');
}
