// =============================================================================
// Epoch-seconds <-> ISO-date conversion shared between DateRangeControl (whose
// `<input type="date">` elements emit/accept ISO `YYYY-MM-DD` strings but
// whose value model — BaseFilterValue's `date_range` — stores epoch seconds)
// and the drawer adapter (which converts between that epoch-second model and
// the RPC's ISO `{from,to}` shape). Single source of truth — do not
// reimplement elsewhere.
// =============================================================================

export function dateToEpochSeconds(iso: string | undefined): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

export function epochSecondsToDate(s: number | undefined): string {
  if (typeof s !== "number") return "";
  const d = new Date(s * 1000);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
