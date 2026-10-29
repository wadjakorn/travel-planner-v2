'use client';

import { useState } from 'react';
import { Input, Label } from '@/components/ui';
import { ActionForm, ActionError, ActionSubmit } from '@/components/action-form';
import { updateTripAction } from '@/app/actions/trips';
import { useT } from '@/components/i18n-provider';

type Props = {
  tripId: string;
  title: string;
  startDate: string | null;
  endDate: string | null;
};

export function TripSettingsForm({
  tripId,
  title,
  startDate,
  endDate,
}: Props) {
  const t = useT();
  const [start, setStart] = useState(startDate ?? '');
  const [end, setEnd] = useState(endDate ?? '');

  const dateOrderError = Boolean(start && end && end < start);

  return (
    <ActionForm
      className="mt-4 grid gap-4"
      action={updateTripAction}
      successMessage={t('tripset_saved_toast')}
    >
      <input type="hidden" name="tripId" value={tripId} />

      <div>
        <Label htmlFor="trip-title">{t('tripset_name_label')}</Label>
        <Input
          id="trip-title"
          name="title"
          required
          defaultValue={title}
          placeholder={t('tripset_name_placeholder')}
        />
      </div>

      <div>
        <Label>{t('trip_new_dates_label')}</Label>
        {/* Two date inputs plus a separator do not fit a 320px screen; below
            that they stack rather than overflow. */}
        <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:items-center">
          <Input
            aria-label={t('trip_new_start_aria')}
            name="startDate"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            invalid={dateOrderError}
            aria-describedby="trip-dates-msg"
          />
          <span className="hidden text-muted min-[400px]:inline" aria-hidden>
            –
          </span>
          <Input
            aria-label={t('trip_new_end_aria')}
            name="endDate"
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
            invalid={dateOrderError}
            aria-describedby="trip-dates-msg"
          />
        </div>
        <p
          id="trip-dates-msg"
          aria-live="polite"
          className={`mt-1.5 text-xs ${dateOrderError ? 'text-danger' : 'text-muted'}`}
        >
          {dateOrderError ? t('trip_new_date_error') : t('tripset_dates_hint')}
        </p>
      </div>

      <ActionError />

      <div className="flex items-center justify-end">
        <SaveButton disabled={dateOrderError} />
      </div>
    </ActionForm>
  );
}

function SaveButton({ disabled }: { disabled: boolean }) {
  const t = useT();
  return <ActionSubmit disabled={disabled}>{t('booking_save_changes')}</ActionSubmit>;
}
