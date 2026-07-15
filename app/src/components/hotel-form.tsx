// HotelForm — server-side entry for the add/edit hotel flows. Thin wrapper
// around the client HotelFormClient (which owns the interactive, intent-first
// UI: Places picker, derived nights, "Additional info" disclosure, inline
// delete). Mirrors TransportForm.

import { HotelFormClient, type HotelInitial } from './hotel-form-client';

type Props = {
  mode: 'add' | 'edit';
  action: (formData: FormData) => Promise<void>;
  deleteAction?: (formData: FormData) => Promise<void>;
  hidden?: Record<string, string>;
  initial?: HotelInitial;
  cancelHref?: string;
  tripStart?: string | null;
  tripEnd?: string | null;
};

export function HotelForm(props: Props) {
  return <HotelFormClient {...props} />;
}
