import { proxyToBackend } from "@/app/api/utils/backend-proxy";

/**
 * GET /api/collections/pairs → backend GET /collections/pairs (Foundation).
 * No POST here — pairs are only created via POST /api/collections/from-filter
 * with `split_by_jurisdiction: true` (Spec C); this route only lists/reads/deletes.
 */
export async function GET() {
  return proxyToBackend({ path: "/collections/pairs" });
}
