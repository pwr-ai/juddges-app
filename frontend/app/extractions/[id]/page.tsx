import { headers } from "next/headers";
import { notFound } from "next/navigation";

import {
  EXTRACTION_SNAPSHOT_HEADER,
  EXTRACTION_SNAPSHOT_SIGNATURE_HEADER,
  EXTRACTION_VERIFIED_USER_HEADER,
  decodeExtractionSnapshot,
  isValidExtractionJobId,
  verifyExtractionSnapshot,
} from "@/lib/extractions/detail-contract";

import { ExtractionJobClient } from "./_components/ExtractionJobClient";

interface ExtractionJobPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ExtractionJobPage({
  params,
}: ExtractionJobPageProps): Promise<React.JSX.Element> {
  const { id: jobId } = await params;
  if (!isValidExtractionJobId(jobId)) notFound();

  const requestHeaders = await headers();
  const encoded = requestHeaders.get(EXTRACTION_SNAPSHOT_HEADER);
  const signature = requestHeaders.get(EXTRACTION_SNAPSHOT_SIGNATURE_HEADER);
  const userId = requestHeaders.get(EXTRACTION_VERIFIED_USER_HEADER);
  const route = `/extractions/${jobId}`;
  if (
    !encoded ||
    !signature ||
    !userId ||
    !(await verifyExtractionSnapshot(
      encoded,
      signature,
      userId,
      route,
      process.env.BACKEND_API_KEY ?? ""
    ))
  ) {
    throw new Error("Invalid verified extraction snapshot provenance");
  }

  const initialJob = decodeExtractionSnapshot(encoded, jobId);
  if (!initialJob) {
    throw new Error("Malformed verified extraction snapshot");
  }

  return <ExtractionJobClient jobId={jobId} initialJob={initialJob} />;
}
