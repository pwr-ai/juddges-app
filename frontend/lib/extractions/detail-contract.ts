import type { DocumentExtractionResult } from "@/types/search";

export const EXTRACTION_SNAPSHOT_HEADER = "x-juddges-extraction-snapshot";
export const EXTRACTION_SNAPSHOT_SIGNATURE_HEADER =
  "x-juddges-extraction-snapshot-signature";
export const EXTRACTION_VERIFIED_USER_HEADER =
  "x-juddges-extraction-verified-user";

const JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ExtractionJobSnapshot {
  job_id: string;
  collection_id?: string | null;
  collection_name?: string | null;
  schema_id?: string | null;
  schema_name?: string | null;
  status: string;
  results: DocumentExtractionResult[];
  progress?: {
    completed: number;
    total: number;
    percentage?: number;
  } | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export function isValidExtractionJobId(jobId: string): boolean {
  return JOB_ID_PATTERN.test(jobId);
}

export function normalizeExtractionJobPayload(
  payload: unknown,
  expectedJobId: string
): ExtractionJobSnapshot | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const responseJobId = record.job_id ?? record.task_id;
  if (
    typeof responseJobId !== "string" ||
    responseJobId !== expectedJobId ||
    typeof record.status !== "string" ||
    record.status.trim().length === 0 ||
    (record.results !== undefined &&
      record.results !== null &&
      !Array.isArray(record.results))
  ) {
    return null;
  }

  return {
    job_id: expectedJobId,
    status: record.status,
    results: (record.results ?? []) as DocumentExtractionResult[],
    progress: isProgress(record.progress) ? record.progress : undefined,
    created_at: optionalString(record.created_at),
    updated_at: optionalString(record.updated_at),
    collection_id: optionalString(record.collection_id),
    collection_name: optionalString(record.collection_name),
    schema_id: optionalString(record.schema_id),
    schema_name: optionalString(record.schema_name),
  };
}

export function isTerminalExtractionStatus(status: string): boolean {
  return [
    "SUCCESS",
    "FAILURE",
    "FAILED",
    "COMPLETED",
    "PARTIALLY_COMPLETED",
    "CANCELLED",
    "CANCELED",
  ].includes(status.trim().toUpperCase());
}

function optionalString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function isProgress(
  value: unknown
): value is ExtractionJobSnapshot["progress"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const progress = value as Record<string, unknown>;
  return (
    typeof progress.completed === "number" &&
    typeof progress.total === "number" &&
    (progress.percentage === undefined || typeof progress.percentage === "number")
  );
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function signingPayload(
  encoded: string,
  userId: string,
  route: string
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    `${userId.length}:${userId}${route.length}:${route}${encoded.length}:${encoded}`
  ) as Uint8Array<ArrayBuffer>;
}

export function encodeExtractionSnapshot(snapshot: ExtractionJobSnapshot): string {
  return bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(snapshot))
  );
}

export function decodeExtractionSnapshot(
  encoded: string,
  expectedJobId: string
): ExtractionJobSnapshot | null {
  try {
    const payload: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encoded))
    );
    return normalizeExtractionJobPayload(payload, expectedJobId);
  } catch {
    return null;
  }
}

export async function signExtractionSnapshot(
  encoded: string,
  userId: string,
  route: string,
  secret: string
): Promise<string> {
  if (!secret) throw new Error("Extraction snapshot signing secret is missing");
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    signingPayload(encoded, userId, route)
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyExtractionSnapshot(
  encoded: string,
  signature: string,
  userId: string,
  route: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) return false;
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      base64UrlToBytes(signature) as Uint8Array<ArrayBuffer>,
      signingPayload(encoded, userId, route)
    );
  } catch {
    return false;
  }
}
