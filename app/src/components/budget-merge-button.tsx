'use client';

// "Merge into booking": removes a logged expense that duplicates a booking's
// cost. The booking already counts the amount, so deleting the logged copy is
// the whole merge. Always behind a confirm — the suggestion is a guess from
// matching amounts, and the logged row's label and note go with it.

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui';
import { ConfirmDialog } from '@/components/confirm-dialog';
import type { MergeSuggestion } from '@/lib/expense-queries';

type Props = {
  suggestion: MergeSuggestion;
  // Pre-formatted by the server view, so client and server agree on the
  // currency formatting.
  amountLabel: string;
  action: (formData: FormData) => Promise<void>;
  className?: string;
};

export function BudgetMergeButton({ suggestion, amountLabel, action, className }: Props) {
  const [open, setOpen] = useState(false);
  const [pending, startMerge] = useTransition();

  function confirmMerge() {
    const fd = new FormData();
    fd.set('expenseId', suggestion.expenseId);
    startMerge(async () => {
      await action(fd);
      setOpen(false);
    });
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={className}
      >
        Merge into booking
      </Button>

      <ConfirmDialog
        open={open}
        title="Merge into booking?"
        message={`“${suggestion.expenseLabel}” will be removed. ${suggestion.bookingLabel} already counts ${amountLabel}.`}
        confirmLabel="Merge"
        busy={pending}
        onConfirm={confirmMerge}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
