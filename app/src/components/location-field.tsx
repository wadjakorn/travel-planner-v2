'use client';

import { useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { Locate } from '@/components/icons';
import { Button } from '@/components/ui';
import { LOCATION_ERROR_COPY, formatLatLng, parseLocationInput } from '@/lib/places/parse-location';
import baseStyles from './trip-create-form.module.css';
import type { LatLng } from './map-renderer-props';

const PinPickerMap = dynamic(() => import('./pin-picker-map'), { ssr: false });

export type LocationFieldProps = {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  center: LatLng;
  zoom?: number;
  mapHeight: number;
  /** Form-level "required" message, tied to the input. */
  error?: string | null;
  inputRef?: React.Ref<HTMLInputElement>;
};

// Pointer-free location entry for the pin picker (WCAG 2.1.1): type/paste
// coordinates or a Google Maps link, or pan the map and use its centre.
export function LocationField({
  value,
  onChange,
  center,
  zoom = 12,
  mapHeight,
  error,
  inputRef,
}: LocationFieldProps): React.JSX.Element {
  const id = useId();
  const inputId = `${id}-input`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const [text, setText] = useState(value ? formatLatLng(value) : '');
  const [applied, setApplied] = useState(text);
  const [parseError, setParseError] = useState<string | null>(null);
  const [focus, setFocus] = useState<LatLng | null>(null);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);

  // A pick from the map or the centre button rewrites the text.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value) {
      const t = formatLatLng(value);
      setText(t);
      setApplied(t);
    }
    setParseError(null);
  }

  function apply() {
    setApplied(text);
    const r = parseLocationInput(text);
    if (r.ok) {
      const p = { lat: r.lat, lng: r.lng };
      onChange(p);
      setFocus({ ...p });
      setParseError(null);
      setText(formatLatLng(p));
      return;
    }
    setParseError(r.reason === 'empty' ? null : LOCATION_ERROR_COPY[r.reason]);
  }

  const shownError = parseError ?? error ?? null;
  const describedBy = shownError ? `${hintId} ${errorId}` : hintId;

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={`${baseStyles.label} mb-1`}>Location</legend>
      <div className={baseStyles.field}>
        <label htmlFor={inputId} className={baseStyles.label}>
          Coordinates or Google Maps link
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          inputMode="text"
          autoComplete="off"
          placeholder="35.6812, 139.7671"
          className={baseStyles.input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
            e.preventDefault();
            apply();
          }}
          onBlur={() => {
            if (text !== applied) apply();
          }}
          aria-describedby={describedBy}
          aria-invalid={shownError ? true : undefined}
        />
        <p id={hintId} className="m-0 pl-1 text-xs text-muted">
          Paste coordinates or a Google Maps link, tap the map, or move the map and use its center.
        </p>
        <p id={errorId} aria-live="polite" className="m-0 pl-1 text-[13px] text-danger">
          {shownError}
        </p>

        <div className="relative overflow-hidden rounded-xl border border-border" style={{ height: mapHeight }}>
          <PinPickerMap
            center={center}
            zoom={zoom}
            value={value}
            onPick={onChange}
            onCenterChange={setMapCenter}
            focus={focus}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2"
          >
            <span className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-foreground/70" />
            <span className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-foreground/70" />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!mapCenter}
            onClick={() => {
              if (mapCenter) onChange(mapCenter);
            }}
          >
            <Locate className="h-4 w-4" aria-hidden />
            Use map center
          </Button>
          <p aria-live="polite" className="m-0 text-xs text-muted">
            {value ? `Location set: ${formatLatLng(value)}` : 'No location yet.'}
          </p>
        </div>
      </div>
    </fieldset>
  );
}
