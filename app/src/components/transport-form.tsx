// TransportForm — server-side entry for the add/edit transport flows. Thin
// wrapper around the client TransportFormClient (which owns the interactive,
// intent-first UI: Places pickers, computed title, timezone-aware arrival).

import { TransportFormClient, type TransportInitial } from './transport-form-client';

type Props = {
  mode: 'add' | 'edit';
  action: (formData: FormData) => Promise<void>;
  deleteAction?: (formData: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  // `title` is accepted for back-compat with existing callers but ignored —
  // the client computes the title from type + endpoints.
  initial?: TransportInitial & { title?: string | null };
  cancelHref?: string;
};

export function TransportForm(props: Props) {
  return <TransportFormClient {...props} />;
}
