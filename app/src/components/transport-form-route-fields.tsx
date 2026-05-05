// TransportFormRouteFields — From/To location + datetime fields.
// Server component; no browser-only APIs.

import baseStyles from './trip-create-form.module.css';

type RouteFieldValues = {
  fromCode?: string | null;
  fromName?: string | null;
  fromDate?: string | null;
  fromTime?: string | null;
  fromTerminal?: string | null;
  toCode?: string | null;
  toName?: string | null;
  toDate?: string | null;
  toTime?: string | null;
  toTerminal?: string | null;
};

type Props = {
  v: RouteFieldValues;
};

export function TransportFormRouteFields({ v }: Props) {
  return (
    <>
      {/* ── From ─────────────────────────────────────────── */}
      <div className={baseStyles.field} style={{ marginTop: 6 }}>
        <span className={baseStyles.label} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          From
        </span>
      </div>

      {/* Row: fromCode + fromName */}
      <div className={baseStyles.row}>
        <div className={baseStyles.field}>
          <label htmlFor="tf-fromCode" className={baseStyles.label}>
            Code
          </label>
          <input
            id="tf-fromCode"
            name="fromCode"
            type="text"
            defaultValue={v.fromCode ?? ''}
            placeholder="LAX"
            className={baseStyles.input}
          />
        </div>

        <div className={baseStyles.field}>
          <label htmlFor="tf-fromName" className={baseStyles.label}>
            Station / Airport
          </label>
          <input
            id="tf-fromName"
            name="fromName"
            type="text"
            defaultValue={v.fromName ?? ''}
            placeholder="Los Angeles Intl"
            className={baseStyles.input}
          />
        </div>
      </div>

      {/* Row: fromDate + fromTime */}
      <div className={baseStyles.row}>
        <div className={baseStyles.field}>
          <label htmlFor="tf-fromDate" className={baseStyles.label}>
            Date
          </label>
          <input
            id="tf-fromDate"
            name="fromDate"
            type="date"
            defaultValue={v.fromDate ?? ''}
            className={baseStyles.input}
          />
        </div>

        <div className={baseStyles.field}>
          <label htmlFor="tf-fromTime" className={baseStyles.label}>
            Time
          </label>
          <input
            id="tf-fromTime"
            name="fromTime"
            type="text"
            defaultValue={v.fromTime ?? ''}
            placeholder="10:30 AM"
            className={baseStyles.input}
          />
        </div>
      </div>

      {/* fromTerminal (full width) */}
      <div className={baseStyles.field}>
        <label htmlFor="tf-fromTerminal" className={baseStyles.label}>
          Terminal / Platform
        </label>
        <input
          id="tf-fromTerminal"
          name="fromTerminal"
          type="text"
          defaultValue={v.fromTerminal ?? ''}
          placeholder="Terminal B"
          className={baseStyles.input}
        />
      </div>

      {/* ── To ───────────────────────────────────────────── */}
      <div className={baseStyles.field} style={{ marginTop: 6 }}>
        <span className={baseStyles.label} style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          To
        </span>
      </div>

      {/* Row: toCode + toName */}
      <div className={baseStyles.row}>
        <div className={baseStyles.field}>
          <label htmlFor="tf-toCode" className={baseStyles.label}>
            Code
          </label>
          <input
            id="tf-toCode"
            name="toCode"
            type="text"
            defaultValue={v.toCode ?? ''}
            placeholder="NRT"
            className={baseStyles.input}
          />
        </div>

        <div className={baseStyles.field}>
          <label htmlFor="tf-toName" className={baseStyles.label}>
            Station / Airport
          </label>
          <input
            id="tf-toName"
            name="toName"
            type="text"
            defaultValue={v.toName ?? ''}
            placeholder="Tokyo Narita"
            className={baseStyles.input}
          />
        </div>
      </div>

      {/* Row: toDate + toTime */}
      <div className={baseStyles.row}>
        <div className={baseStyles.field}>
          <label htmlFor="tf-toDate" className={baseStyles.label}>
            Date
          </label>
          <input
            id="tf-toDate"
            name="toDate"
            type="date"
            defaultValue={v.toDate ?? ''}
            className={baseStyles.input}
          />
        </div>

        <div className={baseStyles.field}>
          <label htmlFor="tf-toTime" className={baseStyles.label}>
            Time
          </label>
          <input
            id="tf-toTime"
            name="toTime"
            type="text"
            defaultValue={v.toTime ?? ''}
            placeholder="3:05 PM"
            className={baseStyles.input}
          />
        </div>
      </div>

      {/* toTerminal (full width) */}
      <div className={baseStyles.field}>
        <label htmlFor="tf-toTerminal" className={baseStyles.label}>
          Terminal / Platform
        </label>
        <input
          id="tf-toTerminal"
          name="toTerminal"
          type="text"
          defaultValue={v.toTerminal ?? ''}
          placeholder="Terminal 1"
          className={baseStyles.input}
        />
      </div>
    </>
  );
}
