import { auth } from '@/lib/auth';
import { canWrite, getTripRole, type TripRole } from '@/lib/trip-access';

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new Error('Not authenticated');
  return session.user.id;
}

export async function requireTripWrite(
  tripId: string,
): Promise<{ userId: string; role: TripRole }> {
  const userId = await requireUserId();
  const role = await getTripRole(tripId, userId);
  if (!canWrite(role)) throw new Error('Forbidden');
  return { userId, role: role as TripRole };
}

export async function requireTripOwner(
  tripId: string,
): Promise<{ userId: string }> {
  const userId = await requireUserId();
  const role = await getTripRole(tripId, userId);
  if (role !== 'owner') throw new Error('Forbidden');
  return { userId };
}
