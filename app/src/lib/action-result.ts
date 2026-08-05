// The result contract for server actions that a form needs to report on.
//
// Actions must RETURN failures, never throw them. A thrown error is stripped to
// a bare digest in a production build ("The specific message is omitted..."),
// so every carefully written validation message becomes the same useless screen
// for the user. Returning keeps the message.
//
// Pair with <ActionForm> (components/action-form.tsx), which renders `message`
// inline on failure and toasts it on success.

import { ServiceError } from '@/lib/services/service-error';

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

export const actionOk = (message?: string): ActionResult => ({ ok: true, message });

export const actionError = (message: string): ActionResult => ({ ok: false, message });

// Thrown by requireUserId / requireTripWrite. They predate this contract and
// still throw plain Errors, so match on the messages they use.
const AUTH_MESSAGES: Record<string, string> = {
  'Not authenticated': 'Your session expired. Sign in again to save this.',
  Forbidden: 'You do not have permission to change this.',
};

// Runs `fn` and converts an expected ServiceError — or an auth/authz failure —
// into a returned failure.
// Anything else still throws — an unexpected crash is not a form validation
// message and should reach the error boundary and the logs.
export async function toActionResult(
  fn: () => Promise<void>,
  successMessage?: string,
): Promise<ActionResult> {
  try {
    await fn();
    return actionOk(successMessage);
  } catch (err) {
    if (err instanceof ServiceError) return actionError(err.message);
    if (err instanceof Error && AUTH_MESSAGES[err.message]) {
      return actionError(AUTH_MESSAGES[err.message]);
    }
    throw err;
  }
}
