// TransportFormMetaFields — duration/seats/bag/cost/attachment fields.
// Server component; no browser-only APIs.

import baseStyles from './trip-create-form.module.css';

type MetaFieldValues = {
  provider?: string | null;
  ref?: string | null;
  duration?: string | null;
  seats?: string | null;
  bag?: string | null;
  costAmount?: number | null;
  costCurrency?: string | null;
};

type Props = {
  v: MetaFieldValues;
};

export function TransportFormMetaFields({ v }: Props) {
  return (
    <>
      {/* ── Details ──────────────────────────────────────── */}

      {/* Row: provider + ref */}
      <div className={baseStyles.row}>
        <div className={baseStyles.field}>
          <label htmlFor="tf-provider" className={baseStyles.label}>
            Provider
          </label>
          <input
            id="tf-provider"
            name="provider"
            type="text"
            defaultValue={v.provider ?? ''}
            placeholder="Japan Airlines"
            className={baseStyles.input}
          />
        </div>

        <div className={baseStyles.field}>
          <label htmlFor="tf-ref" className={baseStyles.label}>
            Booking ref
          </label>
          <input
            id="tf-ref"
            name="ref"
            type="text"
            defaultValue={v.ref ?? ''}
            placeholder="ABC123"
            className={baseStyles.input}
          />
        </div>
      </div>

      {/* Row: duration + seats */}
      <div className={baseStyles.row} style={{ marginTop: 6 }}>
        <div className={baseStyles.field}>
          <label htmlFor="tf-duration" className={baseStyles.label}>
            Duration
          </label>
          <input
            id="tf-duration"
            name="duration"
            type="text"
            defaultValue={v.duration ?? ''}
            placeholder="11h 35m"
            className={baseStyles.input}
          />
        </div>

        <div className={baseStyles.field}>
          <label htmlFor="tf-seats" className={baseStyles.label}>
            Seats
          </label>
          <input
            id="tf-seats"
            name="seats"
            type="text"
            defaultValue={v.seats ?? ''}
            placeholder="14A, 14B"
            className={baseStyles.input}
          />
        </div>
      </div>

      {/* Bag (full width) */}
      <div className={baseStyles.field}>
        <label htmlFor="tf-bag" className={baseStyles.label}>
          Baggage
        </label>
        <input
          id="tf-bag"
          name="bag"
          type="text"
          defaultValue={v.bag ?? ''}
          placeholder="2 × 23kg checked"
          className={baseStyles.input}
        />
      </div>

      {/* Row: costAmount + costCurrency */}
      <div className={baseStyles.row}>
        <div className={baseStyles.field}>
          <label htmlFor="tf-costAmount" className={baseStyles.label}>
            Cost
          </label>
          <input
            id="tf-costAmount"
            name="costAmount"
            type="number"
            min="0"
            step="0.01"
            defaultValue={v.costAmount ?? ''}
            placeholder="0.00"
            className={baseStyles.input}
          />
        </div>

        <div className={baseStyles.field}>
          <label htmlFor="tf-costCurrency" className={baseStyles.label}>
            Currency
          </label>
          <input
            id="tf-costCurrency"
            name="costCurrency"
            type="text"
            defaultValue={v.costCurrency ?? 'USD'}
            placeholder="USD"
            className={baseStyles.input}
          />
        </div>
      </div>
    </>
  );
}
