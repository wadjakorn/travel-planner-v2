'use client';

// A <form> that reports what happened. Not settings-specific — use it for any
// server action that returns an ActionResult.
//
// Success toasts (the app's existing toast system, mounted in the root layout);
// failure renders inline via <ActionError>, because the user has to come back
// and fix the value and a message that disappears in three seconds cannot be
// acted on. <ActionSubmit> disables itself while the action is in flight.
//
// State reaches those two through context rather than a render prop, so a
// SERVER component can use this: children cross the boundary as elements, and a
// function child would not be serializable.

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import { useToast } from '@/components/toast';
import { usePendingSaves } from '@/components/pending-saves';
import type { ActionResult } from '@/lib/action-result';

type FormState = { pending: boolean; error: string | null };

const ActionFormContext = createContext<FormState>({ pending: false, error: null });

export function useActionForm(): FormState {
  return useContext(ActionFormContext);
}

type Props = {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  successMessage: string;
  className?: string;
  children: ReactNode;
};

export function ActionForm({ action, successMessage, className, children }: Props) {
  const [result, formAction, pending] = useActionState(action, null);
  const { toast } = useToast();
  const { begin, end } = usePendingSaves();
  const lastToasted = useRef<ActionResult | null>(null);

  // Registering the in-flight save is what lets the rest of the app refuse to
  // navigate away from a result the user has not seen yet.
  useEffect(() => {
    if (!pending) return;
    begin();
    return end;
  }, [pending, begin, end]);

  useEffect(() => {
    if (!result?.ok || lastToasted.current === result) return;
    lastToasted.current = result;
    toast({ variant: 'success', title: result.message ?? successMessage });
  }, [result, successMessage, toast]);

  const error = result && !result.ok ? result.message : null;

  return (
    <ActionFormContext.Provider value={{ pending, error }}>
      <form action={formAction} className={className}>
        {children}
      </form>
    </ActionFormContext.Provider>
  );
}

export function ActionError({ className }: { className?: string }) {
  const { error } = useActionForm();
  if (!error) return null;
  return (
    <p className={className ?? 'text-sm text-danger'} role="alert">
      {error}
    </p>
  );
}

type SubmitProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingText?: ReactNode;
};

export function ActionSubmit({
  children,
  pendingText,
  disabled,
  ...rest
}: SubmitProps) {
  const { pending } = useActionForm();
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending} {...rest}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
