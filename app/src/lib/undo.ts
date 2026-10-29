// Pure rule for the "Undo" on the booking-delete toast. The toast is visible
// for ~8 s; this server-side window is only the backstop.

export const UNDO_WINDOW_MS = 10 * 60_000;

export function isUndoable(
  deletedAt: Date | null,
  now: Date,
  windowMs: number = UNDO_WINDOW_MS,
): boolean {
  if (!deletedAt) return false;
  return now.getTime() - deletedAt.getTime() < windowMs;
}
