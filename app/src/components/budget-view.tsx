// BudgetView — server component.
// Read-only spending dashboard: total-spent hero, per-day/per-person/avg-meal
// stats, category breakdown bars, and recent expense list.
// No client state. Action stubs (split bills, export) are placeholder buttons.

import Link from 'next/link';
import type { Expense } from '@/db/schema';
import { Plus, Plane, Bed, Fork, MapPin, Sparkle } from '@/components/icons';
import styles from './budget-view.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

type CategoryTotal = { category: string; amount: number; count: number };

type Props = {
  tripId: string;
  budget: number | null;
  totalSpent: number;
  perDay: number;
  perPerson: number;
  avgMeal: number;
  currency: string;
  byCategory: CategoryTotal[];
  recent: Expense[];
  daysCount: number;
  travelersCount: number;
  addExpenseHref: string;
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
  budget,
  totalSpent,
  perDay,
  perPerson,
  avgMeal,
  currency,
  byCategory,
  recent,
  travelersCount,
  addExpenseHref,
}: Props) {
  const pctUsed = budget ? Math.min(Math.round((totalSpent / budget) * 100), 100) : 0;
  const remaining = budget != null ? budget - totalSpent : null;

  // Build ordered category rows; include "other" only if amount > 0
  const catMap = Object.fromEntries(byCategory.map((c) => [c.category, c]));

  const mainCats = ORDERED_CATS.map((id) => {
    const data = catMap[id] ?? { category: id, amount: 0, count: 0 };
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
          <Link href={addExpenseHref} className={styles.addBtn}>
            <Plus aria-hidden="true" />
            Add expense
          </Link>
          <button type="button" className={styles.ghostBtn}>Split bills</button>
          <button type="button" className={styles.ghostBtn}>Export</button>
        </div>
      </header>

      <div className={styles.budWrap}>
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
                <div className={styles.heroBarTrack}>
                  {progressSegs.map((seg) => (
                    <div
                      key={seg.id}
                      className={styles.heroBarSeg}
                      style={{
                        left: `${seg.left}%`,
                        width: `${seg.width}%`,
                        background: seg.color,
                      }}
                    />
                  ))}
                </div>
                <div className={styles.heroLabels}>
                  <span>{pctUsed}% used</span>
                  {remaining != null && (
                    <span>{fmt(remaining, currency)} remaining</span>
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
            const pct = totalSpent > 0 ? Math.round((c.amount / totalSpent) * 100) : 0;
            const unitLabel = c.count > 0 ? `${c.count} items` : 'budgeted';

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
                      style={{ width: `${pct}%`, background: c.color }}
                    />
                  </div>
                  <div className={styles.catMeta}>
                    <span>{unitLabel}</span>
                    <span>{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Recent expenses ── */}
        <div className={styles.recent}>
          <div className={styles.recentHead}>
            <h3>Recent expenses</h3>
            <button type="button" className={styles.ghostBtn}>View all</button>
          </div>
          {recent.length === 0 ? (
            <div className={styles.empty}>No expenses recorded yet.</div>
          ) : (
            <div className={styles.recentList}>
              {recent.map((e) => {
                const dotColor = CAT_CONFIG[e.category]?.color ?? '#86868b';
                return (
                  <div key={e.id} className={styles.recentRow}>
                    <div className={styles.recentDate}>{fmtDate(e.at)}</div>
                    <div
                      className={styles.recentDot}
                      style={{ background: dotColor }}
                      aria-hidden="true"
                    />
                    <div className={styles.recentLabel}>{e.label ?? e.category}</div>
                    <div className={styles.recentAmount}>{fmt(e.amount, e.currency, 2)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
