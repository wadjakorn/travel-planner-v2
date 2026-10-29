'use client';

import type { PlaceSuggestion } from '@/lib/places/types';
import { gmapsSearchUrl } from '@/lib/gmaps';
import { Modal } from '@/components/ui';
import { PlacePreviewCard } from './place-preview-card';

// Renders from the autocomplete suggestion only — no details fetch; that
// happens at add-time (parent's pick/submit path).
export function PlacePreviewModal({
  prediction,
  adding,
  onClose,
  onConfirm,
}: {
  prediction: PlaceSuggestion;
  adding: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const name = prediction.name;
  const address = prediction.secondary;

  return (
    <Modal open onRequestClose={onClose} title={name} size="sm">
      <PlacePreviewCard
        name={name}
        address={address}
        gmapsUrl={gmapsSearchUrl({ name: prediction.name, address: prediction.secondary, lat: prediction.lat, lng: prediction.lng, placeIdExternal: prediction.id })}
        adding={adding}
        onClose={onClose}
        onAdd={onConfirm}
      />
    </Modal>
  );
}
