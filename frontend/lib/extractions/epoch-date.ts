// =============================================================================
// Epoch-seconds <-> ISO-date conversion shared between DateRangeControl (which
// speaks epoch seconds, matching the browser's `<input type="date">`/native
// range widgets) and the drawer adapter (which speaks the RPC's ISO
// `{from,to}` shape). Single source of truth — do not reimplement elsewhere.
// =============================================================================

export function dateToEpochSeconds(iso: string): number | undefined {
  if (!iso) return undefined;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / 1000) : undefined;
}

export function epochSecondsToDate(s: number | undefined): string {
  if (typeof s !== "number") return "";
  const d = new Date(s * 1000);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}
