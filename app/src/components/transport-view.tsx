// TransportView — server component.
// Read-only list of transport bookings grouped/sorted by fromDate ASC.
// Ported from design/bookings-views.jsx `TransportView`.

import Link from 'next/link';
import type { TransportBooking } from '@/db/schema';
import { Plane, Train, Car, Boat, Edit, Trash, Plus } from '@/components/icons';
import styles from './transport-view.module.css';

type Props = {
  tripId: string;
  bookings: TransportBooking[];
  editHrefBase: string;
  removeAction: (formData: FormData) => Promise<void>;
  canEdit?: boolean;
};

function TypeIcon({ type }: { type: TransportBooking['type'] }) {
  if (type === 'train') return <Train />;
  if (type === 'car') return <Car />;
  if (type === 'ferry') return <Boat />;
  return <Plane />;
}

const TYPE_LABEL: Record<TransportBooking['type'], string> = {
  flight: 'Flight',
  train: 'Train',
  car: 'Car rental',
  ferry: 'Ferry',
};

function formatCost(amount: number | null, currency: string | null) {
  if (amount == null) return null;
  const sym = currency === 'THB' ? '฿' : '$';
  return `${sym}${amount.toLocaleString()}`;
}

export function TransportView({
  tripId,
  bookings,
  editHrefBase,
  removeAction,
  canEdit = true,
}: Props) {
  const total = bookings.reduce((s, b) => s + (b.costAmount ?? 0), 0);
  const totalFormatted = total > 0 ? `$${total.toLocaleString()}` : null;

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <header className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Getting around</div>
          <h1 className={styles.title}>Transport</h1>
          <div className={styles.meta}>
            <span className={styles.badge}>{bookings.length}</span>
            {bookings.length === 1 ? ' booking' : ' bookings'}
            {totalFormatted && <> · <span className={styles.total}>{totalFormatted}</span> total</>}
          </div>
        </div>
        {canEdit ? (
          <Link href={`${editHrefBase}/new`} className={styles.addBtn}>
            <Plus />
            Add transport
          </Link>
        ) : null}
      </header>

      {/* Empty state */}
      {bookings.length === 0 && (
        <div className={styles.empty}>
          <p>No transport bookings yet.</p>
          {canEdit ? (
            <Link href={`${editHrefBase}/new`} className={styles.addBtn}>
              <Plus />
              Add transport
            </Link>
          ) : null}
        </div>
      )}

      {/* Card list */}
      {bookings.length > 0 && (
        <ul className={styles.list}>
          {bookings.map((b) => {
            const costStr = formatCost(b.costAmount, b.costCurrency);
            return (
              <li key={b.id} className={styles.card}>
                {/* Left: type icon + label */}
                <div className={`${styles.typeIcon} ${styles[`type_${b.type}`]}`}>
                  <span className={styles.typeIconWrap}>
                    <TypeIcon type={b.type} />
                  </span>
                  <span className={styles.typeLabel}>{TYPE_LABEL[b.type]}</span>
                </div>

                {/* Right: body */}
                <div className={styles.body}>
                  {/* Title row */}
                  <div className={styles.titleRow}>
                    <div className={styles.titleBlock}>
                      <h3 className={styles.name}>{b.title}</h3>
                      {(b.provider || b.ref) && (
                        <div className={styles.providerRow}>
                          {b.provider}
                          {b.provider && b.ref && ' · '}
                          {b.ref && <span className={styles.mono}>{b.ref}</span>}
                        </div>
                      )}
                    </div>
                    {(costStr || b.duration) && (
                      <div className={styles.cost}>
                        {costStr && <div className={styles.costAmount}>{costStr}</div>}
                        {b.duration && <div className={styles.costSub}>{b.duration}</div>}
                      </div>
                    )}
                  </div>

                  {/* Route diagram */}
                  <div className={styles.route}>
                    {/* From endpoint */}
                    <div className={styles.endpoint}>
                      {b.fromTime && <div className={styles.endpointTime}>{b.fromTime}</div>}
                      {b.fromCode && <div className={styles.endpointCode}>{b.fromCode}</div>}
                      {b.fromName && <div className={styles.endpointName}>{b.fromName}</div>}
                      {(b.fromDate || b.fromTerminal) && (
                        <div className={styles.endpointTerminal}>
                          {[b.fromDate, b.fromTerminal].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>

                    {/* Middle line */}
                    <div className={styles.routeBar}>
                      <div className={styles.routeTrack} />
                      <div className={styles.routeIco}>
                        <TypeIcon type={b.type} />
                      </div>
                      {b.duration && (
                        <div className={styles.routeDuration}>{b.duration}</div>
                      )}
                    </div>

                    {/* To endpoint */}
                    <div className={`${styles.endpoint} ${styles.endpointRight}`}>
                      {b.toTime && <div className={styles.endpointTime}>{b.toTime}</div>}
                      {b.toCode && <div className={styles.endpointCode}>{b.toCode}</div>}
                      {b.toName && <div className={styles.endpointName}>{b.toName}</div>}
                      {(b.toDate || b.toTerminal) && (
                        <div className={styles.endpointTerminal}>
                          {[b.toDate, b.toTerminal].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Meta: seats + baggage */}
                  {(b.seats || b.bag) && (
                    <div className={styles.meta}>
                      {b.seats && (
                        <span className={styles.metaItem}>
                          <span className={styles.metaLabel}>
                            {b.type === 'car' ? 'Vehicle' : 'Seats'}
                          </span>
                          <span className={styles.metaValue}>{b.seats}</span>
                        </span>
                      )}
                      {b.bag && (
                        <span className={styles.metaItem}>
                          <span className={styles.metaLabel}>Baggage</span>
                          <span className={styles.metaValue}>{b.bag}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Footer: attachment + actions */}
                  <div className={styles.foot}>
                    {b.attachmentName && (
                      <span className={styles.attach}>
                        <span className={styles.attachIco}>PDF</span>
                        <span className={styles.attachName}>{b.attachmentName}</span>
                        {b.attachmentSize && (
                          <span className={styles.attachSize}>{b.attachmentSize}</span>
                        )}
                      </span>
                    )}
                    <span className={styles.spacer} />
                    {canEdit ? (
                    <div className={styles.actions}>
                      <Link
                        href={`${editHrefBase}/${b.id}/edit`}
                        className={styles.editBtn}
                        aria-label={`Edit ${b.title}`}
                      >
                        <Edit />
                      </Link>
                      <form action={removeAction}>
                        <input type="hidden" name="bookingId" value={b.id} />
                        <button
                          type="submit"
                          className={styles.deleteBtn}
                          aria-label={`Delete ${b.title}`}
                        >
                          <Trash />
                        </button>
                      </form>
                    </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
