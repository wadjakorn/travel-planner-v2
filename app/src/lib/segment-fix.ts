// Which stop a leg can't be routed from/to, and where to fix it.

type LocPlace = {
  id: string;
  name: string;
  lat?: number | null;
  lng?: number | null;
  editHref?: string;
  synthetic?: boolean;
};

const located = (p: LocPlace) => p.lat != null && p.lng != null;

/** The stop without coordinates on the leg `from → to` (the next stop wins
 *  when both lack them), or null when either end is absent or both are located.
 *  `editHrefBase` null = viewer: no fix link. Synthetic hotel stops link to
 *  their booking (`editHref`), real places to `${editHrefBase}/{id}/edit`. */
export function missingLocation(
  from: LocPlace | null | undefined,
  to: LocPlace | null | undefined,
  editHrefBase: string | null,
): { name: string; fixHref: string | null } | null {
  if (!from || !to) return null;
  const p = !located(to) ? to : !located(from) ? from : null;
  if (!p) return null;
  let fixHref: string | null = null;
  if (editHrefBase != null) {
    if (p.editHref) fixHref = p.editHref;
    else if (!p.synthetic) fixHref = `${editHrefBase}/${p.id}/edit`;
  }
  return { name: p.name, fixHref };
}
