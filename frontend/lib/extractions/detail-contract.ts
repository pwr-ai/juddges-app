import {
  DocumentProcessingStatus,
  type DocumentExtractionResult,
} from "@/types/search";

export const EXTRACTION_SNAPSHOT_HEADER = "x-juddges-extraction-snapshot";
export const EXTRACTION_SNAPSHOT_SIGNATURE_HEADER =
  "x-juddges-extraction-snapshot-signature";
export const EXTRACTION_VERIFIED_USER_HEADER =
  "x-juddges-extraction-verified-user";
export const MAX_EXTRACTION_SNAPSHOT_HEADER_LENGTH = 4_096;

const JOB_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ExtractionJobSnapshot {
  job_id: string;
  collection_id?: string | null;
  collection_name?: string | null;
  schema_id?: string | null;
  schema_name?: string | null;
  status: string;
  progress?: {
    completed: number;
    total: number;
    percentage?: number;
  } | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ExtractionJobResponse extends ExtractionJobSnapshot {
  results: DocumentExtractionResult[];
}

export function isValidExtractionJobId(jobId: string): boolean {
  return JOB_ID_PATTERN.test(jobId);
}

export function normalizeExtractionJobPayload(
  payload: unknown,
  expectedJobId: string
): ExtractionJobResponse | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const responseJobId = record.job_id ?? record.task_id;
  const rawResults = record.results ?? [];
  if (
    typeof responseJobId !== "string" ||
    responseJobId !== expectedJobId ||
    typeof record.status !== "string" ||
    record.status.trim().length === 0 ||
    !Array.isArray(rawResults) ||
    !optionalStringFieldsAreValid(record) ||
    (record.progress !== undefined &&
      record.progress !== null &&
      !isProgress(record.progress))
  ) {
    return null;
  }
  const results = rawResults.map(normalizeExtractionResult);
  if (results.some((result) => result === null)) return null;

  return {
    job_id: expectedJobId,
    status: record.status,
    results: results as DocumentExtractionResult[],
    progress:
      record.progress === null
        ? null
        : isProgress(record.progress)
          ? record.progress
          : undefined,
    created_at: optionalString(record.created_at),
    updated_at: optionalString(record.updated_at),
    collection_id: optionalString(record.collection_id),
    collection_name: optionalString(record.collection_name),
    schema_id: optionalString(record.schema_id),
    schema_name: optionalString(record.schema_name),
  };
}

export function toExtractionJobSnapshot(
  response: ExtractionJobResponse
): ExtractionJobSnapshot {
  const { results: _results, ...snapshot } = response;
  return snapshot;
}

const OPTIONAL_STRING_FIELDS = [
  "created_at",
  "updated_at",
  "collection_id",
  "collection_name",
  "schema_id",
  "schema_name",
] as const;

function optionalStringFieldsAreValid(record: Record<string, unknown>): boolean {
  return OPTIONAL_STRING_FIELDS.every((field) => {
    const value = record[field];
    return value === undefined || value === null || typeof value === "string";
  });
}

function normalizeExtractionResult(
  value: unknown
): DocumentExtractionResult | null {
  if (!isPlainRecord(value)) return null;
  const status = value.status;
  if (
    typeof value.collection_id !== "string" ||
    typeof value.document_id !== "string" ||
    typeof status !== "string" ||
    !Object.values(DocumentProcessingStatus).includes(
      status as DocumentProcessingStatus
    ) ||
    typeof value.created_at !== "string" ||
    typeof value.updated_at !== "string" ||
    !optionalResultString(value.started_at) ||
    !optionalResultString(value.completed_at) ||
    !optionalResultString(value.error_message) ||
    !(value.extracted_data === null || isPlainRecord(value.extracted_data))
  ) {
    return null;
  }
  return {
    collection_id: value.collection_id,
    document_id: value.document_id,
    status: status as DocumentProcessingStatus,
    created_at: value.created_at,
    updated_at: value.updated_at,
    started_at: typeof value.started_at === "string" ? value.started_at : undefined,
    completed_at:
      typeof value.completed_at === "string" ? value.completed_at : undefined,
    error_message:
      typeof value.error_message === "string" ? value.error_message : undefined,
    // Failed rows legitimately contain null in the FastAPI model. Normalize
    // that wire value to an empty object so the established frontend type and
    // rendering guards remain safe.
    extracted_data: value.extracted_data ?? {},
  };
}

function optionalResultString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
    Number.isInteger(progress.completed) &&
    Number.isInteger(progress.total) &&
    (progress.completed as number) >= 0 &&
    (progress.total as number) >= 0 &&
    (progress.completed as number) <= (progress.total as number) &&
    (progress.percentage === undefined ||
      (typeof progress.percentage === "number" &&
        Number.isFinite(progress.percentage) &&
        progress.percentage >= 0 &&
        progress.percentage <= 100))
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

export function encodeExtractionSnapshot(
  snapshot: ExtractionJobSnapshot
): string | null {
  const { results: _results, ...headerSnapshot } = snapshot as ExtractionJobSnapshot & {
    results?: unknown;
  };
  const encoded = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(headerSnapshot))
  );
  return encoded.length <= MAX_EXTRACTION_SNAPSHOT_HEADER_LENGTH ? encoded : null;
}

export function decodeExtractionSnapshot(
  encoded: string,
  expectedJobId: string
): ExtractionJobSnapshot | null {
  if (encoded.length > MAX_EXTRACTION_SNAPSHOT_HEADER_LENGTH) return null;
  try {
    const payload: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encoded))
    );
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return null;
    }
    const record = payload as Record<string, unknown>;
    const responseJobId = record.job_id ?? record.task_id;
    if (
      "results" in record ||
      typeof responseJobId !== "string" ||
      responseJobId !== expectedJobId ||
      typeof record.status !== "string" ||
      record.status.trim().length === 0 ||
      !optionalStringFieldsAreValid(record) ||
      (record.progress !== undefined &&
        record.progress !== null &&
        !isProgress(record.progress))
    ) {
      return null;
    }
    return {
      job_id: expectedJobId,
      status: record.status,
      progress:
        record.progress === null
          ? null
          : isProgress(record.progress)
            ? record.progress
            : undefined,
      created_at: optionalString(record.created_at),
      updated_at: optionalString(record.updated_at),
      collection_id: optionalString(record.collection_id),
      collection_name: optionalString(record.collection_name),
      schema_id: optionalString(record.schema_id),
      schema_name: optionalString(record.schema_name),
    };
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
