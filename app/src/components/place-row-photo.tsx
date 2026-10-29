'use client';

import { PreviewPhoto, PreviewPhotoLoading } from './place-preview-card';
import { useMapPreview } from './map-preview-context';
import { usePinPhoto } from './use-pin-photo';
import { useIsWide } from './use-trip-map-visible';

// Photo for an expanded itinerary row (Google places only). Mounted only while
// the row is open, and shares the pin card's page-session cache, so a row and
// its pin card bill one Place Photo between them. On mobile full-map the list
// is display:none but still mounted, and every carousel swipe expands a row:
// fetch nothing until the list is on screen again, or each swipe would bill an
// unseen photo.
export function PlaceRowPhoto({ googleId }: { googleId: string | null }): React.JSX.Element | null {
  const { fullMap } = useMapPreview();
  const isWide = useIsWide();
  const id = fullMap && !isWide ? null : googleId;
  const photo = usePinPhoto(id);
  if (!id || photo === null) return null;
  if (photo === undefined) return <PreviewPhotoLoading compact />;
  return <PreviewPhoto key={photo.name} photo={photo} compact />;
}
