'use client';

// The submit button. Feeds the surrounding form's pending state into the
// shared Button, so a submit looks the same everywhere in the app. Must be a
// child of a <form> — useFormStatus reads that form's status.

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui';

type Props = React.ComponentProps<typeof Button>;

// No pending label: under `loading` the label is invisible (it only holds the
// width), so the spinner + disabled state is the pending signal.
export function SubmitButton({ children, disabled, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" {...rest} loading={pending} disabled={disabled}>
      {children}
    </Button>
  );
}
