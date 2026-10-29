// Percent labels for the budget page. A real but tiny share must not read
// "0%" (it looks like nothing was spent), and a nearly-full one must not read
// "100%" (it looks like the line was reached). Above 100 is not clamped:
// "124% used" is the fact worth showing.

export function sharePct(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}

export function formatShare(part: number, whole: number): string {
  const x = sharePct(part, whole);
  if (x === 0) return '0%';
  if (x > 0 && x < 1) return '<1%';
  if (x > 99 && x < 100) return '>99%';
  return `${Math.round(x)}%`;
}
