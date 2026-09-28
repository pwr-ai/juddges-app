import Link from "next/link";
import { GitCompareArrows } from "lucide-react";

import type { CollectionPairRef } from "@/types/collection";

/**
 * Links a collection that is one side of a PL/UK pair (backend
 * `CollectionPairRef`, Task 10) to its comparison at `/compare/{pair.id}`.
 * Rendered inside a clickable collection card, so clicks must not bubble
 * into the card's own navigation.
 */
export function CollectionPairBadge({ pair }: { pair: CollectionPairRef }) {
  return (
    <Link
      href={`/compare/${pair.id}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 border border-oxblood px-2 py-0.5 font-mono text-xs text-oxblood hover:bg-oxblood hover:text-parchment"
    >
      <GitCompareArrows className="h-3 w-3" />
      {pair.name} &middot; {pair.role}
    </Link>
  );
}
