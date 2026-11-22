import { notFound } from "next/navigation";

import { parseFullJudgmentId } from "@/lib/search/full-judgment-id";

import { FullJudgmentView } from "./FullJudgmentView";

export const dynamic = "force-dynamic";

/**
 * A judgment from the full corpus (Weaviate v2) that may have no row in the
 * app database. Auth-gated by the middleware: it is not in the public-route
 * policy, so a guest is login-redirected before this renders.
 */
export default async function FullJudgmentPage({
  params,
}: {
  params: Promise<{ judgmentId: string }>;
}): Promise<React.JSX.Element> {
  const judgmentId = parseFullJudgmentId((await params).judgmentId);
  if (!judgmentId) notFound();
  return <FullJudgmentView judgmentId={judgmentId} />;
}
