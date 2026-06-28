'use client';

// TripCreateForm — /trip/new. Client component so the destination field can
// use Places autocomplete (auto-fills subtitle + cover) and the date range can
// validate inline. Submits the createTripAction server action.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { PlaceAutocomplete } from '@/components/place-autocomplete';
import { SubmitButton } from '@/components/submit-button';
import { Input, Label, buttonClasses } from '@/components/ui';

type Props = {
  action: (formData: FormData) => Promise<void>;
  cancelHref?: string;
};

const fieldCls =
  'w-full bg-surface text-foreground border border-input rounded-lg h-11 px-3 text-sm ' +
  'placeholder:text-muted outline-none transition-colors ' +
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring';

function nightsBetween(start: string, end: string): number | null {
  if (!start || !end) return null;
  const a = new Date(start);
  const b = new Date(end);
  const ms = b.getTime() - a.getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.round(ms / 86_400_000);
}

export function TripCreateForm({ action, cancelHref = '/' }: Props) {
  const [subtitle, setSubtitle] = useState('');
  const [cover, setCover] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const nights = useMemo(() => nightsBetween(start, end), [start, end]);
  const dateError = Boolean(start && end && nights === null);

  return (
    <main className="mx-auto flex min-h-[calc(100dvh-57px)] w-full max-w-lg flex-col justify-center px-6 py-10">
      <h1 className="text-title tracking-tight text-foreground">Plan a new trip</h1>
      <p className="mt-1 text-sm text-muted">
        Start with a destination — we’ll fill in the rest.
      </p>

      <form action={action} className="mt-8 flex flex-col gap-5">
        <div>
          <Label htmlFor="tcf-title">Destination</Label>
          <PlaceAutocomplete
            inputName="title"
            inputId="tcf-title"
            placeholder="Where to? e.g. Tokyo, Japan"
            inputClassName={fieldCls}
            onSelect={(s) => {
              setSubtitle((prev) => prev || s.address || s.name);
              setCover(s.name);
            }}
          />
          <p className="mt-1.5 text-xs text-muted">
            Pick a suggestion to auto-fill the rest, or just type a name.
          </p>
        </div>

        <div>
          <Label htmlFor="tcf-subtitle">Subtitle</Label>
          <Input
            id="tcf-subtitle"
            name="subtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            placeholder="Tokyo · Hakone · Kamakura"
            className="h-11"
          />
        </div>

        <input type="hidden" name="cover" value={cover} />

        <div>
          <Label>Dates</Label>
          <div className="flex items-center gap-2">
            <Input
              aria-label="Start date"
              name="startDate"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-11"
            />
            <span className="text-muted" aria-hidden>
              →
            </span>
            <Input
              aria-label="End date"
              name="endDate"
              type="date"
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
              className="h-11"
            />
          </div>
          {dateError ? (
            <p className="mt-1.5 text-xs text-danger">
              End date can’t be before the start date.
            </p>
          ) : nights != null ? (
            <p className="mt-1.5 text-xs text-muted">
              {nights} {nights === 1 ? 'night' : 'nights'}
            </p>
          ) : null}
        </div>

        <div className="mt-2 flex items-center justify-end gap-3">
          <Link href={cancelHref} className={buttonClasses('ghost', 'md')}>
            Cancel
          </Link>
          <SubmitButton
            className={buttonClasses('primary', 'md')}
            pendingText="Creating…"
          >
            Create trip
          </SubmitButton>
        </div>
      </form>
    </main>
  );
}
