'use client';

// ExpenseModalHost — client island holding the budget page's expense
// add/edit overlay. budget-view.tsx is a server component and cannot own
// this state, so this wraps it: the modal state and the <Modal> itself live
// here, the server-rendered budget content is passed through as `children`,
// and two leaf trigger components (exported below) reach into the same
// context to open the overlay from inside that server-rendered tree —
// mirrors bookings-view.tsx's overlay, split across the server/client
// boundary budget-view forces.

import { createContext, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/ui';
import { ExpenseForm, type ExpenseFormHandle } from './expense-form';
import type { EditableExpense } from '@/lib/editable-expense';

type Ctx = {
  openAdd: () => void;
  openEdit: (id: string) => void;
};

const ExpenseModalContext = createContext<Ctx | null>(null);

function useExpenseModalCtx(): Ctx {
  const ctx = useContext(ExpenseModalContext);
  if (!ctx) {
    throw new Error(
      'ExpenseAddTrigger/ExpenseRowTrigger must render inside ExpenseModalHost',
    );
  }
  return ctx;
}

type Props = {
  tripId: string;
  tripCurrency: string;
  days: Array<{ idx: number; label: string }>;
  editable: EditableExpense[];
  addAction: (formData: FormData) => Promise<void>;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
  children: ReactNode;
};

export function ExpenseModalHost({
  tripId,
  tripCurrency,
  days,
  editable,
  addAction,
  updateAction,
  deleteAction,
  children,
}: Props) {
  const [openId, setOpenId] = useState<string | 'new' | null>(null);
  const formHandleRef = useRef<ExpenseFormHandle | null>(null);

  function closeOverlay() {
    setOpenId(null);
  }

  // Every close path — Escape, backdrop click — goes through the active
  // form's own dirty check, not straight to closeOverlay.
  function requestCloseOverlay() {
    if (formHandleRef.current) formHandleRef.current.requestClose(closeOverlay);
    else closeOverlay();
  }

  const mode: 'add' | 'edit' = openId === 'new' ? 'add' : 'edit';
  const editing =
    openId && openId !== 'new' ? (editable.find((e) => e.id === openId) ?? null) : null;
  // A miss (editable row not found) must never open a blank edit form — do
  // nothing rather than render one with an empty amount/label/note.
  const open = openId === 'new' || editing !== null;

  const ctx: Ctx = {
    openAdd: () => setOpenId('new'),
    openEdit: (id) => setOpenId(id),
  };

  return (
    <ExpenseModalContext.Provider value={ctx}>
      {children}
      <Modal
        open={open}
        onRequestClose={requestCloseOverlay}
        title={mode === 'edit' ? 'Edit expense' : 'Add expense'}
      >
        {open && (
          <ExpenseForm
            key={mode === 'edit' ? (openId as string) : 'add-expense'}
            ref={formHandleRef}
            mode={mode}
            action={mode === 'edit' ? updateAction : addAction}
            deleteAction={mode === 'edit' ? deleteAction : undefined}
            hidden={mode === 'edit' ? { expenseId: openId as string } : { tripId }}
            initial={
              mode === 'edit' && editing
                ? {
                    category: editing.category,
                    label: editing.label,
                    amount: editing.amount,
                    dayIdx: editing.dayIdx,
                    note: editing.note,
                    at: editing.at,
                  }
                : { category: 'food' }
            }
            tripCurrency={tripCurrency}
            days={days}
            bookingsHref={`/trip/${tripId}/bookings`}
            onDone={closeOverlay}
            onCancel={closeOverlay}
          />
        )}
      </Modal>
    </ExpenseModalContext.Provider>
  );
}

// ─── Triggers ───────────────────────────────────────────────────────────────
// Leaf client components meant to render inside budget-view's
// server-rendered tree, reaching into the host's context to open the
// overlay. Kept in this module rather than a separate file — they have no
// purpose outside this host.

type AddTriggerProps = {
  className?: string;
  children: ReactNode;
};

export function ExpenseAddTrigger({ className, children }: AddTriggerProps) {
  const { openAdd } = useExpenseModalCtx();
  return (
    <button type="button" className={className} onClick={openAdd}>
      {children}
    </button>
  );
}

type RowTriggerProps = {
  id: string;
  className?: string;
  children: ReactNode;
};

// Only rows with source === 'expense' should ever be wrapped in this — hotel
// and transport rows are not expenses and keep their existing Link into the
// bookings page instead (see budget-view.tsx).
export function ExpenseRowTrigger({ id, className, children }: RowTriggerProps) {
  const { openEdit } = useExpenseModalCtx();
  return (
    <button type="button" className={className} onClick={() => openEdit(id)}>
      {children}
    </button>
  );
}
