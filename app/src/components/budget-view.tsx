// BudgetView — server component.
// Spending dashboard: total-spent hero, per-day/per-person/avg-meal stats,
// category breakdown bars, and the recent-entries list.
//
// The list mixes hand-entered expenses with costs derived from hotel and
// transport bookings, tagged by source. That mix is deliberate: the hero
// number counts booking costs, so a list that showed only expense rows would
// not add up to it, and a total the user cannot reconcile is a total they
// stop believing.
//

import Link from 'next/link';
import { PageContainer } from '@/components/ui/page-container';
import { BudgetSettingsForm } from '@/components/budget-settings-form';
import type { ActionResult } from '@/lib/action-result';
import type { BudgetBasis, ExpenseCategory, TripBudgetConfig } from '@/db/schema';
import type { BudgetRow, CategoryTotal } from '@/lib/expense-queries';
import { Alert, AlertStack } from '@/components/alert';
import { Plus, Plane, Bed, Fork, MapPin, Sparkle } from '@/components/icons';
import styles from './budget-view.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  tripId: string;
  // The resolved budget: config.amount already multiplied out by basis.
  budget: number | null;
  budgetConfig: TripBudgetConfig | null;
  totalSpent: number;
  perDay: number;
  perPerson: number;
  avgMeal: number;
  currency: string;
  byCategory: CategoryTotal[];
  recent: BudgetRow[];
  excluded: { count: number; currencies: string[] };
  missingCost: { hotels: number; transport: number };
  daysCount: number;
  travelersCount: number;
  addExpenseHref: string;
  canEdit?: boolean;
  // Only the owner can open /trip/[id]/settings, so only the owner gets the
  // link there. An editor may still change the budget — they keep the inline
  // form rather than a link to a page that would notFound() on them.
  isOwner?: boolean;
  affectedRows: number;
  saveBudgetAction: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
};

const SOURCE_TAG: Record<BudgetRow['source'], string | null> = {
  expense: null,
  hotel: 'booking',
  transport: 'booking',
};

// ─── Category config ──────────────────────────────────────────────────────────

type CatConfig = {
  label: string;
  color: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const CAT_CONFIG: Record<string, CatConfig> = {
  transport:  { label: 'Transport',         color: '#0071e3', Icon: Plane   },
  hotels:     { label: 'Hotels',            color: '#5b3fd9', Icon: Bed     },
  food:       { label: 'Food & dining',     color: '#ff8a3d', Icon: Fork    },
  activities: { label: 'Activities',        color: '#29a847', Icon: MapPin  },
  shopping:   { label: 'Shopping & misc',   color: '#ef476f', Icon: Sparkle },
};

const ORDERED_CATS = ['transport', 'hotels', 'food', 'activities', 'shopping'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number, currency: string, decimals = 0): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(amount);
}

function fmtDate(at: Date): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(at);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BudgetView({
  tripId,
  budget,
  budgetConfig,
  totalSpent,
  perDay,
  perPerson,
  avgMeal,
  currency,
  byCategory,
  recent,
  excluded,
  missingCost,
  travelersCount,
  addExpenseHref,
  canEdit = true,
  isOwner = false,
  affectedRows,
  saveBudgetAction,
}: Props) {
  // The real percentage, not clamped: 124% used is the fact, and rounding it
  // down to 100% would hide exactly the situation worth showing.
  const hasBudget =
    budgetConfig?.amount != null ||
    Object.values(budgetConfig?.caps ?? {}).some((v) => v != null);
  const pctUsed = budget ? Math.round((totalSpent / budget) * 100) : 0;
  const overBy = budget != null ? totalSpent - budget : null;
  const overBudget = overBy != null && overBy > 0;
  const remaining = budget != null && !overBudget ? budget - totalSpent : null;

  const unpriced = missingCost.hotels + missingCost.transport;
  const parts = [
    missingCost.hotels > 0
      ? `${missingCost.hotels} ${missingCost.hotels === 1 ? 'stay' : 'stays'}`
      : null,
    missingCost.transport > 0
      ? `${missingCost.transport} ${missingCost.transport === 1 ? 'ride' : 'rides'}`
      : null,
  ].filter(Boolean) as string[];

  // Build ordered category rows; include "other" only if amount > 0
  const catMap = Object.fromEntries(byCategory.map((c) => [c.category, c]));

  const empty = { amount: 0, count: 0, fromBooking: 0, fromExpense: 0 };
  const mainCats = ORDERED_CATS.map((id) => {
    const data = catMap[id] ?? { category: id as ExpenseCategory, ...empty };
    const cfg = CAT_CONFIG[id];
    return { ...data, ...cfg };
  });

  const otherData = catMap['other'];
  const otherRow =
    otherData && otherData.amount > 0
      ? { ...otherData, label: 'Misc', color: '#86868b', Icon: null as null }
      : null;

  const allCats = otherRow ? [...mainCats, otherRow] : mainCats;

  // Build segment widths for progress bar (proportional to budget)
  const progressSegs = allCats
    .filter((c) => c.amount > 0 && budget)
    .reduce<Array<{ id: string; color: string; left: number; width: number }>>(
      (acc, c) => {
        const prev = acc.length ? acc[acc.length - 1] : null;
        const left = prev ? prev.left + prev.width : 0;
        const width = (c.amount / budget!) * 100;
        acc.push({ id: c.category, color: c.color, left, width });
        return acc;
      },
      []
    );

  return (
    <div className={styles.wrap}>
      <PageContainer>
      {/* ── Header ── */}
      <header className={styles.head}>
        <div>
          <div className={styles.eyebrow}>Spending</div>
          <h1 className={styles.title}>Budget</h1>
          <div className={styles.meta}>
            {travelersCount > 0 && `${travelersCount} ${travelersCount === 1 ? 'traveler' : 'travelers'}`}
          </div>
        </div>
        <div className={styles.actions}>
          {canEdit ? (
            <Link href={addExpenseHref} className={styles.addBtn}>
              <Plus aria-hidden="true" />
              Add expense
            </Link>
          ) : null}
          {canEdit ? (
            <button type="button" className={styles.ghostBtn}>
              Split bills
            </button>
          ) : null}
          <Link
            href={`/trip/${tripId}/budget/export`}
            className={styles.ghostBtn}
            download
            // Known gap: the export covers logged expenses only, so its total
            // is lower than the one above whenever bookings carry costs.
            title="Exports logged expenses only — booking costs are not included"
          >
            Export CSV
          </Link>
        </div>
      </header>

      <div className={styles.budWrap}>
        {/* Everything that makes the numbers below mean less than they appear,
            stated before the numbers rather than under them. */}
        {(unpriced > 0 || excluded.count > 0) && (
          <AlertStack>
            {unpriced > 0 && (
              <Alert
                tone="warning"
                action={{ href: `/trip/${tripId}/bookings`, label: 'Add costs' }}
              >
                <span className={styles.alertTitle}>
                  {unpriced} {unpriced === 1 ? 'booking has' : 'bookings have'} no cost yet
                </span>
                {parts.length > 0 ? ` (${parts.join(', ')})` : ''} — not counted in the total.
              </Alert>
            )}
            {excluded.count > 0 && (
              <Alert tone="warning">
                <span className={styles.alertTitle}>
                  {excluded.count} {excluded.count === 1 ? 'entry is' : 'entries are'} in{' '}
                  {excluded.currencies.join(', ')}
                </span>
                {' '}— this trip is tracked in {currency}, and amounts are never converted, so
                they stay out of the total.
              </Alert>
            )}
          </AlertStack>
        )}

        {/* One home for editing: trip settings owns currency + budgetConfig.
            This page reads them. */}
        {canEdit && isOwner && (
          <p className={styles.settingsLink}>
            <Link href={`/trip/${tripId}/settings?s=budget`}>
              Edit budget & currency
            </Link>
          </p>
        )}

        {canEdit && !isOwner && (
          <BudgetSettingsForm
            tripId={tripId}
            currency={currency}
            amount={budgetConfig?.amount ?? null}
            basis={(budgetConfig?.basis ?? 'total') as BudgetBasis}
            caps={budgetConfig?.caps ?? {}}
            affectedRows={affectedRows}
            categories={ORDERED_CATS.map((id) => ({
              id: id as ExpenseCategory,
              label: CAT_CONFIG[id].label,
            }))}
            action={saveBudgetAction}
            compact
          />
        )}

        {/* Without a target or a cap the numbers below are spend with nothing
            to measure against — say so instead of letting the page imply a
            budget exists. */}
        {!hasBudget && (
          <AlertStack>
            <Alert tone="info">
              <span className={styles.alertTitle}>No budget set for this trip</span>{' '}
              — everything below is what has been spent so far, with nothing to
              compare it to.{' '}
              {canEdit ? (
                <Link href={`/trip/${tripId}/settings?s=budget`}>Set a budget</Link>
              ) : null}
            </Alert>
          </AlertStack>
        )}

        {/* ── Hero card ── */}
        <div className={styles.heroCard}>
          <div className={styles.heroMain}>
            <div className={styles.eyebrow}>Total spent</div>
            <div className={styles.heroTotal}>{fmt(totalSpent, currency)}</div>
            {budget != null && (
              <div className={styles.heroOf}>of {fmt(budget, currency)} budget</div>
            )}

            {budget != null && (
              <div className={styles.heroBar}>
                {/* Over budget, the per-category breakdown stops being the
                    point — the bar becomes one danger-coloured run, because
                    the only thing worth reading is that the line was crossed. */}
                <div className={styles.heroBarTrack}>
                  {overBudget ? (
                    <div
                      className={`${styles.heroBarSeg} ${styles.heroBarOver}`}
                      style={{ left: 0, width: '100%' }}
                    />
                  ) : (
                    progressSegs.map((seg) => (
                      <div
                        key={seg.id}
                        className={styles.heroBarSeg}
                        style={{
                          left: `${seg.left}%`,
                          width: `${seg.width}%`,
                          background: seg.color,
                        }}
                      />
                    ))
                  )}
                </div>
                <div className={styles.heroLabels}>
                  <span>{pctUsed}% used</span>
                  {overBudget ? (
                    // Never "-1,240 remaining". Nothing remains; the trip is
                    // over, and the number that matters is by how much.
                    <span className={styles.overPill}>
                      {fmt(overBy!, currency)} over budget
                    </span>
                  ) : (
                    remaining != null && <span>{fmt(remaining, currency)} remaining</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Side stats ── */}
          <div className={styles.statsCard}>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Per day</span>
              <span className={styles.statValue}>{fmt(perDay, currency)}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Per person</span>
              <span className={styles.statValue}>{fmt(perPerson, currency)}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>Avg meal</span>
              <span className={styles.statValue}>{fmt(avgMeal, currency)}</span>
            </div>
          </div>
        </div>

        {/* ── Category grid ── */}
        <div className={styles.catGrid}>
          {allCats.map((c) => {
            // "items" now spans every source, bookings included — the count
            // and the amount above it come from the same set of rows.
            const cap = budgetConfig?.caps?.[c.category as ExpenseCategory] ?? null;
            // Says what is true about THIS category. It used to read
            // "budgeted" whenever the count was zero, which claimed a budget
            // had been set for a category that had neither a cap nor an entry.
            const unitLabel =
              c.count > 0
                ? `${c.count} item${c.count === 1 ? '' : 's'}`
                : cap != null
                  ? 'nothing spent yet'
                  : 'no entries';
            // With a cap set, the bar measures spend against that cap — the
            // question the cap exists to answer. Without one it falls back to
            // this category's share of the total, which is why the only
            // category with any spending used to render a full bar.
            const denom = cap ?? totalSpent;
            const pct = denom > 0 ? Math.min(Math.round((c.amount / denom) * 100), 100) : 0;

            return (
              <div key={c.category} className={styles.catCard}>
                <div
                  className={styles.catIcon}
                  style={{
                    background: `${c.color}18`,
                    color: c.color,
                  }}
                >
                  {c.Icon ? (
                    <c.Icon aria-hidden="true" />
                  ) : (
                    <span
                      aria-hidden="true"
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: c.color,
                      }}
                    />
                  )}
                </div>
                <div className={styles.catBody}>
                  <div className={styles.catRow}>
                    <span className={styles.catLabel}>{c.label}</span>
                    <span className={styles.catAmount}>{fmt(c.amount, currency)}</span>
                  </div>
                  <div className={styles.catBar}>
                    <div
                      className={styles.catBarFill}
                      style={{
                        width: `${pct}%`,
                        // Same rule as the hero: past the cap, the category
                        // colour stops being the message.
                        background: cap != null && c.amount > cap ? 'var(--danger)' : c.color,
                      }}
                    />
                  </div>
                  <div className={styles.catMeta}>
                    <span>{unitLabel}</span>
                    <span>{pct}% {cap != null ? 'of cap' : 'of total'}</span>
                  </div>
                  {cap != null && (
                    <div className={`${styles.note} ${c.amount > cap ? styles.capOver : ''}`}>
                      {c.amount > cap
                        ? `Over cap by ${fmt(c.amount - cap, currency)} (cap ${fmt(cap, currency)})`
                        : `${fmt(cap - c.amount, currency)} left of ${fmt(cap, currency)} cap`}
                    </div>
                  )}
                  {/* Both sources in one category may well be the same money
                      logged twice. Both are counted — silently netting them
                      off would be a guess. */}
                  {c.fromBooking > 0 && c.fromExpense > 0 && (
                    <div className={styles.note}>
                      Includes {fmt(c.fromBooking, currency)} from bookings and{' '}
                      {fmt(c.fromExpense, currency)} logged manually — check for double counting.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Recent expenses ── */}
        <div className={styles.recent}>
          <div className={styles.recentHead}>
            <h3>Recent entries</h3>
          </div>
          {recent.length === 0 ? (
            <div className={styles.empty}>Nothing counted toward this budget yet.</div>
          ) : (
            <div className={styles.recentList}>
              {recent.map((e) => {
                const dotColor = CAT_CONFIG[e.category]?.color ?? '#86868b';
                const tag = SOURCE_TAG[e.source];
                return (
                  <Link
                    key={`${e.source}:${e.id}`}
                    href={e.href}
                    className={`${styles.recentRow} ${styles.recentRowLink}`}
                  >
                    <div className={styles.recentDate}>{fmtDate(e.at)}</div>
                    <div
                      className={styles.recentDot}
                      style={{ background: dotColor }}
                      aria-hidden="true"
                    />
                    <div className={styles.recentLabel}>
                      {e.label}
                      {tag && <span className={styles.srcTag}> {tag}</span>}
                    </div>
                    <div className={styles.recentAmount}>{fmt(e.amount, e.currency, 2)}</div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </PageContainer>
    </div>
  );
}
