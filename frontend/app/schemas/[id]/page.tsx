import { headers } from "next/headers";
import { notFound } from "next/navigation";

import {
  SCHEMA_SNAPSHOT_HEADER,
  SCHEMA_SNAPSHOT_SIGNATURE_HEADER,
  SCHEMA_SNAPSHOT_USER_HEADER,
  SCHEMA_FAILURE_STATUS_HEADER,
  decodeSchemaSnapshot,
  isCanonicalSchemaId,
  verifySchemaSnapshot,
} from "@/lib/schemas/detail-transport";

import SchemaDetailClient from "./client";
import SchemaDetailFailure from "@/components/schemas/SchemaDetailFailure";

interface SchemaDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SchemaDetailPage({
  params,
}: SchemaDetailPageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  if (!isCanonicalSchemaId(id)) notFound();

  const requestHeaders = await headers();
  const failureStatus = Number(requestHeaders.get(SCHEMA_FAILURE_STATUS_HEADER));
  if ([401, 403, 500, 502, 503, 504].includes(failureStatus)) {
    return <SchemaDetailFailure status={failureStatus} />;
  }
  const encoded = requestHeaders.get(SCHEMA_SNAPSHOT_HEADER);
  const signature = requestHeaders.get(SCHEMA_SNAPSHOT_SIGNATURE_HEADER);
  const userId = requestHeaders.get(SCHEMA_SNAPSHOT_USER_HEADER);
  const path = `/schemas/${id}`;

  if (
    !encoded ||
    !signature ||
    !userId ||
    !(await verifySchemaSnapshot(
      encoded,
      signature,
      userId,
      path,
      process.env.BACKEND_API_KEY ?? ""
    ))
  ) {
    throw new Error("Missing or invalid verified schema snapshot");
  }

  const schema = decodeSchemaSnapshot(encoded, id);
  return <SchemaDetailClient initialSchema={schema} />;
}
