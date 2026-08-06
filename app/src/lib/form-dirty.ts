// Dirty detection for a <form>, split out from React so it can be tested in
// the node environment (this repo has no jsdom).
//
// Comparison is over a normalised serialisation rather than a deep diff: the
// only question is "did anything change", and a string compare answers it in
// one pass with no allocation per field.
//
// Files are skipped. A File has no stable value to compare and re-selecting
// the same file would otherwise read as a change.

export function serializeEntries(
  entries: Iterable<[string, FormDataEntryValue]>,
): string {
  const pairs: Array<[string, string]> = [];
  for (const [key, value] of entries) {
    if (typeof value !== 'string') continue; // File
    pairs.push([key, value]);
  }
  // Sort so DOM order changes (a conditionally rendered field moving) do not
  // read as edits. Ties broken by value to keep repeated keys deterministic.
  pairs.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  return pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

export function snapshotForm(form: HTMLFormElement): string {
  return serializeEntries(new FormData(form).entries());
}

export function isDirty(snapshot: string, form: HTMLFormElement): boolean {
  return snapshotForm(form) !== snapshot;
}
