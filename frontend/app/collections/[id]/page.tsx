import CollectionClient from "./client";
import { notFound, redirect } from "next/navigation";
import {
  CollectionDetailUnavailableError,
  loadCollectionDetail,
} from "@/lib/server/collection-detail";

type CollectionParams = Promise<{ id: string }>;

export const dynamic = "force-dynamic";
export const revalidate = 0;

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async function CollectionPage({
  params
}: {
  params: CollectionParams
}) {
  const { id } = await params;
  const result = await loadCollectionDetail(id, { limit: 20 });

  if (result.kind === "invalid" || result.kind === "not_found") {
    notFound();
  }
  if (result.kind === "unauthenticated") {
    redirect(`/auth/login?next=${encodeURIComponent(`/collections/${id}`)}`);
  }
  if (result.kind === "unavailable") {
    throw new CollectionDetailUnavailableError(result.status, result.reason);
  }

  return (
    <CollectionClient id={id} initialCollection={result.collection} />
  );
}
