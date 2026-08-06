// The expense shape the form needs, which is not the shape the budget list
// shows. BudgetRow is a display projection (mixed-source, no dayIdx, no note);
// this is the editable row, keyed by id.

import type { ExpenseCategory } from '@/db/schema';

export type EditableExpense = {
  id: string;
  category: ExpenseCategory;
  label: string | null;
  amount: number;
  dayIdx: number | null;
  note: string | null;
  at: string; // YYYY-MM-DD
};

type Row = Omit<EditableExpense, 'at'> & { at: Date };

export function toEditableExpense(row: Row): EditableExpense {
  return { ...row, at: row.at.toISOString().slice(0, 10) };
}
