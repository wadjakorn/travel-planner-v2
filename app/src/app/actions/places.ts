'use server';

// Place CRUD server actions — thin wrappers over place-service. FormData
// parsing lives here; domain logic in @/lib/services/place-service.

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/with-trip-auth';
import { trimOrNull, parseNumber } from '@/lib/form-parsers';
import { resolveDayWrite } from '@/lib/services/access';
import { touchTrip } from '@/lib/touch-trip';
import {
  addPlace,
  updatePlace,
  updatePlaceNote,
  removePlace,
  reorderPlaces,
  type PlaceFields,
  type PlaceKind,
} from '@/lib/services/place-service';
import { refreshPlaceFromGoogle, type RefreshOutcome } from '@/lib/services/google-sync-service';
import { parseFormBase, parseGooglePick } from '@/lib/places/google-sync';

const KINDS = ['hotel', 'food', 'sight', 'transit'] as const;

function parseTags(v: FormDataEntryValue | null): string[] | null {
  if (typeof v !== 'string') return null;
  const tags = v
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  return tags.length > 0 ? tags : [];
}

function parseKind(v: FormDataEntryValue | null): PlaceKind {
  if (typeof v !== 'string' || !KINDS.includes(v as PlaceKind)) {
    throw new Error('Invalid kind');
  }
  return v as PlaceKind;
}

// Planning status — the web form has no status control yet, so the edit page
// round-trips the current value through a hidden field; absent → 'confirmed'.
function parseStatus(v: FormDataEntryValue | null): 'confirmed' | 'tbd' {
  return v === 'tbd' ? 'tbd' : 'confirmed';
}

function readPlaceFields(formData: FormData): PlaceFields {
  // Visible address wins; PlaceAutocomplete's `autoAddress` fills in
  // when the user didn't type one manually.
  const visibleAddress = trimOrNull(formData.get('address'));
  const autoAddress = trimOrNull(formData.get('autoAddress'));
  const reviews = parseNumber(formData.get('reviews'));
  return {
    kind: parseKind(formData.get('kind')),
    status: parseStatus(formData.get('status')),
    // Round-tripped from the edit page (hidden field); the web UI can't set it.
    sourceUrl: trimOrNull(formData.get('sourceUrl')),
    name: trimOrNull(formData.get('name')) ?? '',
    category: trimOrNull(formData.get('category')),
    rating: parseNumber(formData.get('rating')),
    reviews: reviews === null ? null : Math.round(reviews),
    time: trimOrNull(formData.get('time')),
    duration: trimOrNull(formData.get('duration')),
    price: trimOrNull(formData.get('price')),
    address: visibleAddress ?? autoAddress,
    phone: trimOrNull(formData.get('phone')),
    website: trimOrNull(formData.get('website')),
    hours: trimOrNull(formData.get('hours')),
    tags: parseTags(formData.get('tags')),
    thumb: trimOrNull(formData.get('thumb')),
    note: trimOrNull(formData.get('note')),
    lat: parseNumber(formData.get('lat')),
    lng: parseNumber(formData.get('lng')),
    placeIdExternal: trimOrNull(formData.get('placeIdExternal')),
  };
}

export async function addPlaceInlineAction(formData: FormData) {
  // Same as addPlaceAction but no redirect — used by inline picker so the
  // current ?day=N query param survives.
  const userId = await requireUserId();

  const dayId = trimOrNull(formData.get('dayId'));
  if (!dayId) throw new Error('dayId required');

  const googlePick = parseGooglePick(formData.get('googlePick'));
  const { tripId } = await addPlace(userId, dayId, readPlaceFields(formData), undefined, { googlePick });

  revalidatePath(`/trip/${tripId}`);
}

export async function addPlaceAction(formData: FormData) {
  const userId = await requireUserId();

  const dayId = trimOrNull(formData.get('dayId'));
  if (!dayId) throw new Error('dayId required');

  const googlePick = parseGooglePick(formData.get('googlePick'));
  const { tripId } = await addPlace(userId, dayId, readPlaceFields(formData), undefined, { googlePick });

  revalidatePath(`/trip/${tripId}`);
  redirect(`/trip/${tripId}`);
}

export async function updatePlaceAction(formData: FormData) {
  const userId = await requireUserId();

  const placeId = trimOrNull(formData.get('placeId'));
  if (!placeId) throw new Error('placeId required');

  // formBase: the values the edit form rendered, so only fields the user
  // changed are written (parsed once per request: one oversize warning max).
  const { tripId } = await updatePlace(userId, placeId, readPlaceFields(formData), {
    googlePick: parseGooglePick(formData.get('googlePick')),
    formBase: parseFormBase(formData.get('formBase')),
  });

  revalidatePath(`/trip/${tripId}`);
  redirect(`/trip/${tripId}`);
}

export async function updatePlaceNoteAction(formData: FormData) {
  const userId = await requireUserId();

  const placeId = trimOrNull(formData.get('placeId'));
  if (!placeId) throw new Error('placeId required');

  const { tripId } = await updatePlaceNote(
    userId,
    placeId,
    trimOrNull(formData.get('note')),
  );

  revalidatePath(`/trip/${tripId}`);
}

export async function removePlaceAction(formData: FormData) {
  const userId = await requireUserId();

  const placeId = trimOrNull(formData.get('placeId'));
  if (!placeId) throw new Error('placeId required');

  const { tripId } = await removePlace(userId, placeId);

  revalidatePath(`/trip/${tripId}`);
  redirect(`/trip/${tripId}`);
}

export async function reorderPlacesAction(formData: FormData) {
  const userId = await requireUserId();

  const dayId = trimOrNull(formData.get('dayId'));
  const idsCsv = trimOrNull(formData.get('placeIds'));
  if (!dayId || !idsCsv) throw new Error('dayId + placeIds required');

  const newOrder = idsCsv.split(',').map((s) => s.trim()).filter(Boolean);

  const result = await reorderPlaces(userId, dayId, newOrder);
  if (result) revalidatePath(`/trip/${result.tripId}`);
}

export async function optimizeRouteAction(formData: FormData) {
  // Stub — Phase 4 ships the real Directions-API distance matrix and
  // travelling-salesman heuristic. For now the action simply touches the
  // trip and redirects, so the UI affordance is wireable.
  const userId = await requireUserId();

  const dayId = trimOrNull(formData.get('dayId'));
  if (!dayId) throw new Error('dayId required');

  const { tripId } = await resolveDayWrite(userId, dayId);

  await touchTrip(tripId);

  revalidatePath(`/trip/${tripId}`);
  redirect(`/trip/${tripId}`);
}

export async function refreshPlaceFromGoogleAction(
  _prev: { outcome: RefreshOutcome | null },
  formData: FormData,
): Promise<{ outcome: RefreshOutcome }> {
  const userId = await requireUserId();
  const placeId = String(formData.get('placeId') ?? '');
  const tripId = String(formData.get('tripId') ?? '');
  const outcome = await refreshPlaceFromGoogle(userId, placeId);
  if (outcome === 'ok' || outcome === 'not_found' || outcome === 'invalid') {
    revalidatePath(`/trip/${tripId}`);
  }
  return { outcome };
}
