import { PairContent } from "../_components/PairContent";

export const metadata = { title: "Compare PL / UK — saved pair" };

/**
 * `/compare/[pairId]` — a saved PL/UK collection pair (issue #684, Task 18).
 * Dynamic route: exempt from the route-reachability contract by construction
 * (`tests/unit/navigation/route-reachability.test.ts` only scans static
 * routes); reached from `/compare` via `SavePairDialog`'s redirect and from
 * the pair's own permalink.
 */
export default async function ComparePairPage({ params }: { params: Promise<{ pairId: string }> }) {
  const { pairId } = await params;
  return <PairContent pairId={pairId} />;
}
