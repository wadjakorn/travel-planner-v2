import { describe, expect, it } from 'vitest';
import { srcFiles } from '../../../test/src-files';

// A hand-rolled overlay declares role="dialog" or aria-modal itself; Modal is
// the only place allowed to. The two map popups are non-modal (the map stays
// interactive); the a11y-batch plan turns them into role="group" and removes
// them from this list when it lands.
const ALLOWED = new Set([
  'components/ui/modal.tsx',
  'components/pin-card.tsx',
  'components/map-preview-marker.tsx',
]);
// Shrinks to [] as the remaining dialogs move onto Modal.
const PENDING = new Set([
  'components/place-search-picker.tsx',
  'components/place-preview-modal.tsx',
]);

describe('dialog guard', () => {
  it('only Modal renders an ARIA modal dialog', () => {
    const hits = srcFiles(['.tsx'])
      // Exact role="dialog" or aria-modal: ConfirmDialog's role="alertdialog"
      // prop on <Modal> must not match.
      .filter((f) => /role=["']dialog["']|aria-modal/.test(f.text))
      .map((f) => f.rel)
      .filter((r) => !ALLOWED.has(r));
    expect(hits.sort()).toEqual([...PENDING].sort());
  });
});
