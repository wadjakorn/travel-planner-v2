// Drizzle schema. Phase 0 shipped Auth.js tables; Phase 2 adds the
// domain tables (trip / day / place / segment).
//
// Source of truth for entity shapes: ../../REQUIREMENTS.md §4.
// Tags + collaborators + recco kept as JSONB for now; promote to
// junction tables when query needs grow (search / filter).
// place.x / place.y is a placeholder — Phase 4 swaps to lat/lng +
// place_id_external.

import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  primaryKey,
  boolean,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from 'next-auth/adapters';

// ─── Auth.js tables ──────────────────────────────────────────────────────────
// Schema mirrors the Drizzle-adapter contract:
// https://authjs.dev/getting-started/adapters/drizzle

export const users = pgTable('user', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [
    primaryKey({ columns: [account.provider, account.providerAccountId] }),
  ],
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const authenticators = pgTable(
  'authenticator',
  {
    credentialID: text('credentialID').notNull().unique(),
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    providerAccountId: text('providerAccountId').notNull(),
    credentialPublicKey: text('credentialPublicKey').notNull(),
    counter: integer('counter').notNull(),
    credentialDeviceType: text('credentialDeviceType').notNull(),
    credentialBackedUp: boolean('credentialBackedUp').notNull(),
    transports: text('transports'),
  },
  (a) => [primaryKey({ columns: [a.userId, a.credentialID] })],
);

// ─── Domain tables (Phase 2) ─────────────────────────────────────────────────

export const placeKindEnum = pgEnum('place_kind', [
  'hotel',
  'food',
  'sight',
  'transit',
]);

export const segmentModeEnum = pgEnum('segment_mode', [
  'drive',
  'walk',
  'transit',
]);

export const trips = pgTable(
  'trip',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    subtitle: text('subtitle'),
    startDate: text('start_date'), // ISO YYYY-MM-DD
    endDate: text('end_date'),
    cover: text('cover'), // identifier (e.g. 'fuji') or URL
    isPublic: boolean('is_public').notNull().default(false),
    collaborators: jsonb('collaborators')
      .$type<Array<{ initials: string; color: string }>>()
      .default([]),
    recco: jsonb('recco')
      .$type<Array<{ name: string; sub: string; color: string }>>()
      .default([]),
    createdAt: timestamp('created_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (t) => [index('trip_owner_idx').on(t.ownerId)],
);

export const days = pgTable(
  'day',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    label: text('label').notNull(), // "Sat"
    num: integer('num').notNull(), // 12
    date: text('date').notNull(), // "Saturday, April 12"
    title: text('title').notNull(), // "Arrival in Tokyo"
    summaryDistance: text('summary_distance'),
    summaryTime: text('summary_time'),
    optimizeSavingsTime: text('optimize_savings_time'),
    optimizeSavingsSwap: text('optimize_savings_swap'),
  },
  (d) => [uniqueIndex('day_trip_idx_unique').on(d.tripId, d.idx)],
);

export const places = pgTable(
  'place',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    dayId: text('day_id')
      .notNull()
      .references(() => days.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    kind: placeKindEnum('kind').notNull(),
    name: text('name').notNull(),
    category: text('category'),
    rating: doublePrecision('rating'),
    reviews: integer('reviews'),
    time: text('time'),
    duration: text('duration'),
    price: text('price'),
    address: text('address'),
    phone: text('phone'),
    website: text('website'),
    hours: text('hours'),
    tags: jsonb('tags').$type<string[]>().default([]),
    thumb: text('thumb'),
    note: text('note'),
    bookingRef: text('booking_ref'),
    bookingRoom: text('booking_room'),
    bookingNights: integer('booking_nights'),
    bookingTotal: text('booking_total'),
    // Phase 4: real-map columns. x/y kept as fallback during transition;
    // dropped in a cleanup migration once all rows have lat/lng.
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    placeIdExternal: text('place_id_external'),
    x: integer('x'),
    y: integer('y'),
    createdAt: timestamp('created_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (p) => [uniqueIndex('place_day_idx_unique').on(p.dayId, p.idx)],
);

export const segments = pgTable(
  'segment',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    dayId: text('day_id')
      .notNull()
      .references(() => days.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    mode: segmentModeEnum('mode').notNull(),
    distance: text('distance').notNull(),
    time: text('time').notNull(),
  },
  (s) => [uniqueIndex('segment_day_idx_unique').on(s.dayId, s.idx)],
);

// ─── Bookings (Phase 3) ──────────────────────────────────────────────────────

export const transportTypeEnum = pgEnum('transport_type', [
  'flight',
  'train',
  'car',
  'ferry',
]);

export const hotelBookings = pgTable(
  'hotel_booking',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    dayIdx: integer('day_idx'), // which trip-day this check-in pairs with
    name: text('name').notNull(),
    address: text('address'),
    checkInDate: text('check_in_date'),
    checkInTime: text('check_in_time'),
    checkOutDate: text('check_out_date'),
    checkOutTime: text('check_out_time'),
    nights: integer('nights'),
    room: text('room'),
    guests: integer('guests'),
    ref: text('ref'),
    costAmount: doublePrecision('cost_amount'),
    costCurrency: text('cost_currency'),
    cancellation: text('cancellation'),
    contact: text('contact'),
    notes: text('notes'),
    attachmentName: text('attachment_name'),
    attachmentSize: text('attachment_size'),
    attachmentUrl: text('attachment_url'), // placeholder — Phase 10 wires real storage
    thumb: text('thumb'),
    createdAt: timestamp('created_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (b) => [index('hotel_booking_trip_idx').on(b.tripId)],
);

export const transportBookings = pgTable(
  'transport_booking',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    dayIdx: integer('day_idx'),
    type: transportTypeEnum('type').notNull(),
    title: text('title').notNull(),
    provider: text('provider'),
    ref: text('ref'),
    fromCode: text('from_code'),
    fromName: text('from_name'),
    fromTime: text('from_time'),
    fromDate: text('from_date'),
    fromTerminal: text('from_terminal'),
    toCode: text('to_code'),
    toName: text('to_name'),
    toTime: text('to_time'),
    toDate: text('to_date'),
    toTerminal: text('to_terminal'),
    duration: text('duration'),
    seats: text('seats'),
    bag: text('bag'),
    costAmount: doublePrecision('cost_amount'),
    costCurrency: text('cost_currency'),
    attachmentName: text('attachment_name'),
    attachmentSize: text('attachment_size'),
    attachmentUrl: text('attachment_url'),
    createdAt: timestamp('created_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'date' })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { mode: 'date' }),
  },
  (b) => [index('transport_booking_trip_idx').on(b.tripId)],
);

// ─── Type exports ────────────────────────────────────────────────────────────

export type Trip = typeof trips.$inferSelect;
export type NewTrip = typeof trips.$inferInsert;
export type Day = typeof days.$inferSelect;
export type NewDay = typeof days.$inferInsert;
export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
export type Segment = typeof segments.$inferSelect;
export type NewSegment = typeof segments.$inferInsert;
export type HotelBooking = typeof hotelBookings.$inferSelect;
export type NewHotelBooking = typeof hotelBookings.$inferInsert;
export type TransportBooking = typeof transportBookings.$inferSelect;
export type NewTransportBooking = typeof transportBookings.$inferInsert;
