/**
 * Weaviate v2 judgment ids: pl-court `<court>_<dept>_..._<seq>`, NSA paths
 * such as `/doc/39FBE5DB09`. Mirrors `JUDGMENT_ID_PATTERN` in
 * `backend/app/search_v2/api.py`.
 */
const FULL_JUDGMENT_ID_PATTERN = /^[A-Za-z0-9_.\-/]{1,255}$/;

/**
 * The judgment id from a route segment, or `null` when it is malformed.
 *
 * The segment is `encodeURIComponent(id)`; whether Next hands it over decoded
 * is not documented, so it is decoded here when it still carries escapes.
 * Valid ids never contain `%`, so this cannot double-decode one.
 */
export function parseFullJudgmentId(segment: string): string | null {
  let id = segment;
  if (id.includes("%")) {
    try {
      id = decodeURIComponent(id);
    } catch {
      return null;
    }
  }
  return FULL_JUDGMENT_ID_PATTERN.test(id) ? id : null;
}
