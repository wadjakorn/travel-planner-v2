'use client';

// Form submit button that disables itself while the surrounding <form>
// action is pending. Drop in as a child of any server-action form.

import { useFormStatus } from 'react-dom';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingText?: React.ReactNode;
};

export function SubmitButton({ children, pendingText, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending || disabled} aria-busy={pending} {...rest}>
      {pending && pendingText ? pendingText : children}
    </button>
  );
}
