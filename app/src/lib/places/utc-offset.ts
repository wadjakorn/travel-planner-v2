const OFFSET = /^GMT([+-])(\d{2}):(\d{2})$/;

export function utcOffsetMinutes(timeZone: string, at: Date = new Date()): number | null {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!name) return null;
    if (name === 'GMT') return 0;
    const m = OFFSET.exec(name);
    if (!m) return null;
    const mins = Number(m[2]) * 60 + Number(m[3]);
    return m[1] === '-' ? -mins : mins;
  } catch {
    return null;
  }
}
