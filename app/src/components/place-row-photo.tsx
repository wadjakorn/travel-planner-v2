'use client';

import { PreviewPhoto, PreviewPhotoLoading } from './place-preview-card';
import { usePinPhoto } from './use-pin-photo';

// Photo for an expanded itinerary row (Google places only). Mounted only while
// the row is open, and shares the pin card's page-session cache, so a row and
// its pin card bill one Place Photo between them.
export function PlaceRowPhoto({ googleId }: { googleId: string | null }): React.JSX.Element | null {
  const photo = usePinPhoto(googleId);
  if (!googleId || photo === null) return null;
  if (photo === undefined) return <PreviewPhotoLoading compact />;
  return <PreviewPhoto key={photo.name} photo={photo} compact />;
}
