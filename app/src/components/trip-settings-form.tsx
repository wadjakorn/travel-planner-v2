'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Label, buttonClasses } from '@/components/ui';
import { updateTripAction } from '@/app/actions/trips';

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
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [start, setStart] = useState(startDate ?? '');
  const [end, setEnd] = useState(endDate ?? '');

  const dateOrderError = Boolean(start && end && end < start);

  return (
    <form
      className="mt-4 grid gap-4"
      action={async (formData) => {
        if (dateOrderError) {
          setError("End date can't be before the start date.");
          return;
        }
        setSaving(true);
        setError(null);
        try {
          await updateTripAction(formData);
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Couldn't save trip");
        } finally {
          setSaving(false);
        }
      }}
    >
      <input type="hidden" name="tripId" value={tripId} />

      <div>
        <Label htmlFor="trip-title">Trip name</Label>
        <Input
          id="trip-title"
          name="title"
          required
          defaultValue={title}
          placeholder="Tokyo spring trip"
        />
      </div>

      <div>
        <Label>Dates</Label>
        <div className="flex items-center gap-2">
          <Input
            aria-label="Start date"
            name="startDate"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <span className="text-zinc-400" aria-hidden>
            -
          </span>
          <Input
            aria-label="End date"
            name="endDate"
            type="date"
            value={end}
            min={start || undefined}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        {dateOrderError ? (
          <p className="mt-1.5 text-xs text-red-600">
            End date can't be before the start date.
          </p>
        ) : (
          <p className="mt-1.5 text-xs text-zinc-500">
            Date changes keep the current itinerary length or expand it.
          </p>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end">
        <button
          type="submit"
          disabled={saving || dateOrderError}
          className={buttonClasses('primary', 'md')}
        >
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
