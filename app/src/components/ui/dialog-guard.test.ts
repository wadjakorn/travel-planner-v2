import { describe, expect, it } from 'vitest';
import { srcFiles } from '../../../test/src-files';

// A hand-rolled overlay declares role="dialog" or aria-modal itself; Modal is
// the only place allowed to. The map popups (pin card, search preview) are
// non-modal labelled groups (role="group"), so the guard covers them too.
const ALLOWED = new Set(['components/ui/modal.tsx']);

describe('dialog guard', () => {
  it('only Modal renders an ARIA modal dialog', () => {
    const hits = srcFiles(['.tsx'])
      // Exact role="dialog" or aria-modal: ConfirmDialog's role="alertdialog"
      // prop on <Modal> must not match.
      .filter((f) => /role=["']dialog["']|aria-modal/.test(f.text))
      .map((f) => f.rel)
      .filter((r) => !ALLOWED.has(r));
    expect(hits).toEqual([]);
  });
});
