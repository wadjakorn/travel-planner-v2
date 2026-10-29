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
import type { BudgetRow, CategoryTotal, MergeSuggestion } from '@/lib/expense-queries';
import { formatShare, sharePct } from '@/lib/budget-share';
import { BudgetMergeButton } from '@/components/budget-merge-button';
import { Alert, AlertStack } from '@/components/alert';
import { Plus, Plane, Bed, Fork, MapPin, Sparkle } from '@/components/icons';
import { ExpenseAddTrigger, ExpenseRowTrigger } from '@/components/expense-modal-host';
import { getLang, tServer, type MessageKey } from '@/lib/i18n';
import { pluralKey } from '@/lib/i18n-client';
import styles from './budget-view.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  tripId: string;
  // The resolved budget: config.amount already multiplied out by basis.
  budget: number | null;
  budgetConfig: TripBudgetConfig | null;
  totalSpent: number;
  // totalSpent split by source; fromBookings matches the Bookings page total.
  fromBookings: number;
  fromExpenses: number;
  suggestions: MergeSuggestion[];
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
  // Owner + editors — what travelersCount falls back to when budgetConfig has
  // no explicit travelers; the settings form shows it as the placeholder.
  travelersDefault: number;
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
  // Soft-deletes the logged copy named by FormData `expenseId`.
  mergeAction: (formData: FormData) => Promise<void>;
};

const SOURCE_TAG: Record<BudgetRow['source'], MessageKey | null> = {
  expense: null,
  hotel: 'budget_src_booking',
  transport: 'budget_src_booking',
};

// ─── Category config ──────────────────────────────────────────────────────────

type CatConfig = {
  labelKey: MessageKey;
  color: string;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

const CAT_CONFIG: Record<string, CatConfig> = {
  transport:  { labelKey: 'budget_cat_transport',  color: '#0071e3', Icon: Plane   },
  hotels:     { labelKey: 'budget_cat_hotels',     color: '#5b3fd9', Icon: Bed     },
  food:       { labelKey: 'budget_cat_food',       color: '#ff8a3d', Icon: Fork    },
  activities: { labelKey: 'budget_cat_activities', color: '#29a847', Icon: MapPin  },
  shopping:   { labelKey: 'budget_cat_shopping',   color: '#ef476f', Icon: Sparkle },
};

const ORDERED_CATS: ExpenseCategory[] = ['transport', 'hotels', 'food', 'activities', 'shopping'];

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

export async function BudgetView({
  tripId,
  budget,
  budgetConfig,
  totalSpent,
  fromBookings,
  fromExpenses,
  suggestions,
  perDay,
  perPerson,
  avgMeal,
  currency,
  byCategory,
  recent,
  excluded,
  missingCost,
  travelersCount,
  travelersDefault,
  canEdit = true,
  isOwner = false,
  affectedRows,
  saveBudgetAction,
  mergeAction,
}: Props) {
  const [t, lang] = await Promise.all([tServer(), getLang()]);
  const tp = (base: string, n: number, vars?: Record<string, string | number>) =>
    t(pluralKey(lang, base, n), { n, ...vars });

  // The real percentage, not clamped: 124% used is the fact, and rounding it
  // down to 100% would hide exactly the situation worth showing.
  const hasBudget =
    budgetConfig?.amount != null ||
    Object.values(budgetConfig?.caps ?? {}).some((v) => v != null);
  const pctUsed = budget ? formatShare(totalSpent, budget) : '0%';
  const overBy = budget != null ? totalSpent - budget : null;
  const overBudget = overBy != null && overBy > 0;
  const remaining = budget != null && !overBudget ? budget - totalSpent : null;

  const unpriced = missingCost.hotels + missingCost.transport;
  const parts = [
    missingCost.hotels > 0
      ? tp('booking_stays', missingCost.hotels)
      : null,
    missingCost.transport > 0
      ? tp('booking_rides', missingCost.transport)
      : null,
  ].filter(Boolean) as string[];

  // Build ordered category rows; include "other" only if amount > 0
  const catMap = Object.fromEntries(byCategory.map((c) => [c.category, c]));

  const empty = { amount: 0, count: 0, fromBooking: 0, fromExpense: 0 };
  const mainCats = ORDERED_CATS.map((id) => {
    const data = catMap[id] ?? { category: id, ...empty };
    const { labelKey, ...cfg } = CAT_CONFIG[id];
    return { ...data, ...cfg, label: t(labelKey) };
  });

  const otherData = catMap['other'];
  const otherRow =
    otherData && otherData.amount > 0
      ? { ...otherData, label: t('budget_cat_misc'), color: '#86868b', Icon: null as null }
      : null;

  // "{link} to track what's left." — split around the link (Thai word order).
  const [noBudgetBefore, noBudgetAfter = ''] = t('budget_none_body').split('{link}');

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
          <div className={styles.eyebrow}>{t('budget_eyebrow')}</div>
          <h1 className={styles.title}>{t('budget')}</h1>
          <div className={styles.meta}>
            {travelersCount > 0 && tp('trip_travelers', travelersCount)}
          </div>
        </div>
        <div className={styles.actions}>
          {canEdit ? (
            <ExpenseAddTrigger className={styles.addBtn}>
              <Plus aria-hidden="true" />
              {t('expense_add')}
            </ExpenseAddTrigger>
          ) : null}
          {canEdit ? (
            <button type="button" className={styles.ghostBtn}>
              {t('budget_split_bills')}
            </button>
          ) : null}
          <Link
            href={`/trip/${tripId}/budget/export`}
            className={styles.ghostBtn}
            download
            // Known gap: the export covers logged expenses only, so its total
            // is lower than the one above whenever bookings carry costs.
            title={t('budget_export_title')}
          >
            {t('budget_export_csv')}
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
                action={{ href: `/trip/${tripId}/bookings`, label: t('budget_add_costs') }}
              >
                <span className={styles.alertTitle}>
                  {tp('budget_unpriced_title', unpriced)}
                </span>{' '}
                {parts.length > 0
                  ? t('budget_unpriced_body_parts', { parts: parts.join(', ') })
                  : t('budget_unpriced_body')}
              </Alert>
            )}
            {excluded.count > 0 && (
              <Alert tone="warning">
                <span className={styles.alertTitle}>
                  {tp('budget_excluded_title', excluded.count, {
                    currencies: excluded.currencies.join(', '),
                  })}
                </span>
                {' '}{t('budget_excluded_body', { currency })}
              </Alert>
            )}
          </AlertStack>
        )}

        {/* One home for editing: trip settings owns currency + budgetConfig.
            This page reads them. */}
        {canEdit && isOwner && (
          <p className={styles.settingsLink}>
            <Link href={`/trip/${tripId}/settings?s=budget`}>
              {t('budget_edit_settings_link')}
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
            travelers={budgetConfig?.travelers ?? null}
            travelersDefault={travelersDefault}
            affectedRows={affectedRows}
            categories={ORDERED_CATS}
            action={saveBudgetAction}
            compact
          />
        )}

        {/* Without a target or a cap the numbers below are spend with nothing
            to measure against — say so instead of letting the page imply a
            budget exists. */}
        {!hasBudget && (
          <AlertStack>
            {/* The link is owner only: settings notFound()s for everyone
                else, and editors already have the inline form above. Inline
                rather than Alert's `action`, which renders after the body and
                would split "Set a budget" from "to track what's left". */}
            <Alert tone="info">
              <span className={styles.alertTitle}>{t('budget_none_title')}</span>
              {isOwner ? (
                <>
                  {' '}
                  {noBudgetBefore}
                  <Link href={`/trip/${tripId}/settings?s=budget`}>{t('budget_none_link')}</Link>
                  {noBudgetAfter}
                </>
              ) : null}
            </Alert>
          </AlertStack>
        )}

        {/* ── Hero card ── */}
        <div className={styles.heroCard}>
          <div className={styles.heroMain}>
            <div className={styles.eyebrow}>{t('budget_total_spent')}</div>
            <div className={styles.heroTotal}>{fmt(totalSpent, currency)}</div>
            {/* Reconciles with the Bookings page: its total is the first part. */}
            <div className={styles.heroSplit}>
              <Link href={`/trip/${tripId}/bookings`}>
                {t('budget_hero_in_bookings', { amount: fmt(fromBookings, currency) })}
              </Link>
              {' + '}
              <span>{t('budget_hero_other_expenses', { amount: fmt(fromExpenses, currency) })}</span>
            </div>
            {budget != null && (
              <div className={styles.heroOf}>
                {t('budget_hero_of', { amount: fmt(budget, currency) })}
              </div>
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
                  <span>{t('budget_used', { pct: pctUsed })}</span>
                  {overBudget ? (
                    // Never "-1,240 remaining". Nothing remains; the trip is
                    // over, and the number that matters is by how much.
                    <span className={styles.overPill}>
                      {t('budget_over', { amount: fmt(overBy!, currency) })}
                    </span>
                  ) : (
                    remaining != null && (
                      <span>{t('budget_remaining', { amount: fmt(remaining, currency) })}</span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Side stats ── */}
          <div className={styles.statsCard}>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>{t('budget_stat_per_day')}</span>
              <span className={styles.statValue}>{fmt(perDay, currency)}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>{t('budget_stat_per_person')}</span>
              <span className={styles.statValue}>{fmt(perPerson, currency)}</span>
            </div>
            <div className={styles.statRow}>
              <span className={styles.statLabel}>{t('budget_stat_avg_meal')}</span>
              <span className={styles.statValue}>{fmt(avgMeal, currency)}</span>
            </div>
          </div>
        </div>

        {/* ── Category grid ── */}
        <div className={styles.catGrid}>
          {allCats.map((c) => {
            // "items" now spans every source, bookings included — the count
            // and the amount above it come from the same set of rows.
            const cap = budgetConfig?.caps?.[c.category] ?? null;
            // Says what is true about THIS category. It used to read
            // "budgeted" whenever the count was zero, which claimed a budget
            // had been set for a category that had neither a cap nor an entry.
            const unitLabel =
              c.count > 0
                ? tp('budget_items', c.count)
                : cap != null
                  ? t('budget_cat_nothing_spent')
                  : t('budget_cat_no_entries');
            // With a cap set, the bar measures spend against that cap — the
            // question the cap exists to answer. Without one it falls back to
            // this category's share of the total, which is why the only
            // category with any spending used to render a full bar.
            const denom = cap ?? totalSpent;
            // Unrounded width, so a $22 row is a sliver rather than empty.
            const barPct = Math.min(sharePct(c.amount, denom), 100);
            const catSuggestions = canEdit
              ? suggestions.filter((s) => s.category === c.category)
              : [];

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
                        width: `${barPct}%`,
                        // Same rule as the hero: past the cap, the category
                        // colour stops being the message.
                        background: cap != null && c.amount > cap ? 'var(--danger)' : c.color,
                      }}
                    />
                  </div>
                  <div className={styles.catMeta}>
                    <span>{unitLabel}</span>
                    <span>
                      {t(cap != null ? 'budget_share_of_cap' : 'budget_share_of_total', {
                        share: formatShare(c.amount, denom),
                      })}
                    </span>
                  </div>
                  {cap != null && (
                    <div className={`${styles.note} ${c.amount > cap ? styles.capOver : ''}`}>
                      {c.amount > cap
                        ? t('budget_cap_over', {
                            over: fmt(c.amount - cap, currency),
                            cap: fmt(cap, currency),
                          })
                        : t('budget_cap_left', {
                            left: fmt(cap - c.amount, currency),
                            cap: fmt(cap, currency),
                          })}
                    </div>
                  )}
                  {/* Both sources in one category may be the same money logged
                      twice. Both stay counted until the user merges — netting
                      them off silently would be a guess. */}
                  {catSuggestions.length > 0
                    ? catSuggestions.map((s) => (
                        <div key={s.expenseId} className={styles.suggest}>
                          <span id={`merge-${s.expenseId}`} className={styles.suggestText}>
                            {t('budget_merge_suggest', {
                              expense: s.expenseLabel,
                              amount: fmt(s.amount, currency, 2),
                              booking: s.bookingLabel,
                            })}
                          </span>
                          <BudgetMergeButton
                            suggestion={s}
                            amountLabel={fmt(s.amount, currency, 2)}
                            action={mergeAction}
                            className={styles.suggestBtn}
                            describedBy={`merge-${s.expenseId}`}
                          />
                        </div>
                      ))
                    : c.fromBooking > 0 &&
                      c.fromExpense > 0 && (
                        <div className={styles.note}>
                          {t('budget_cat_both_sources', {
                            bookings: fmt(c.fromBooking, currency),
                            logged: fmt(c.fromExpense, currency),
                          })}
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
            <h3>{t('budget_recent_title')}</h3>
          </div>
          {recent.length === 0 ? (
            <div className={styles.empty}>{t('budget_recent_empty')}</div>
          ) : (
            <div className={styles.recentList}>
              {recent.map((e) => {
                const dotColor = CAT_CONFIG[e.category]?.color ?? '#86868b';
                const tag = SOURCE_TAG[e.source];
                const rowClass = `${styles.recentRow} ${styles.recentRowLink}`;
                const content = (
                  <>
                    <div className={styles.recentDate}>{fmtDate(e.at)}</div>
                    <div
                      className={styles.recentDot}
                      style={{ background: dotColor }}
                      aria-hidden="true"
                    />
                    <div className={styles.recentLabel}>
                      {e.label}
                      {tag && <span className={styles.srcTag}> {t(tag)}</span>}
                    </div>
                    <div className={styles.recentAmount}>{fmt(e.amount, e.currency, 2)}</div>
                  </>
                );
                // Only expense rows open the overlay — hotel and transport
                // rows are not expenses and keep their link into bookings.
                return e.source === 'expense' ? (
                  <ExpenseRowTrigger key={`${e.source}:${e.id}`} id={e.id} className={rowClass}>
                    {content}
                  </ExpenseRowTrigger>
                ) : (
                  <Link key={`${e.source}:${e.id}`} href={e.href} className={rowClass}>
                    {content}
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
