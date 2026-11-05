'use server';

// Leg detail sheet save (TP-0152). Returns failures (never throws them) as
// user-language copy; raw English service messages never reach the sheet.

import { revalidatePath } from 'next/cache';
import { requireUserId } from '@/lib/with-trip-auth';
import { actionError, actionOk, toActionResult, type ActionResult } from '@/lib/action-result';
import { tServer } from '@/lib/i18n';
import { ServiceError } from '@/lib/services/service-error';
import { saveLeg, type LegSaveInput } from '@/lib/services/leg-save';

export async function saveLegAction(input: LegSaveInput): Promise<ActionResult> {
  let tripId: string;
  try {
    const userId = await requireUserId();
    ({ tripId } = await saveLeg(userId, input));
  } catch (err) {
    if (err instanceof ServiceError) {
      const t = await tServer();
      if (
        (err.code === 'conflict' && err.message === 'leg_changed') ||
        err.code === 'not_found'
      ) {
        return actionError(t('leg_sheet_changed'));
      }
      if (err.code === 'forbidden') return actionError(t('err_forbidden_change'));
      return actionError(t('leg_sheet_save_error'));
    }
    // Auth failures become copy; anything else rethrows to the error boundary.
    return toActionResult(async () => {
      throw err;
    });
  }
  revalidatePath(`/trip/${tripId}`);
  return actionOk();
}
