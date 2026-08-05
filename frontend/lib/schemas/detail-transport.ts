import type { ExtractionSchema } from "@/types/extraction_schemas";

export const SCHEMA_SNAPSHOT_HEADER = "x-juddges-schema-snapshot";
export const SCHEMA_SNAPSHOT_SIGNATURE_HEADER =
  "x-juddges-schema-snapshot-signature";
export const SCHEMA_SNAPSHOT_USER_HEADER = "x-juddges-schema-snapshot-user";

const CANONICAL_SCHEMA_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SCHEMA_STATUSES = new Set(["draft", "published", "review", "archived"]);

interface AuthLookupError {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
}

const UNAUTHENTICATED_CODES = new Set([
  "bad_jwt",
  "invalid_credentials",
  "no_authorization",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
]);

export function isCanonicalSchemaId(id: string): boolean {
  return CANONICAL_SCHEMA_ID.test(id);
}

export function isUnauthenticatedSchemaAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const authError = error as AuthLookupError;
  if (authError.name === "AuthRetryableFetchError") return false;
  if (authError.status !== undefined && authError.status >= 500) return false;
  if (
    authError.code &&
    UNAUTHENTICATED_CODES.has(authError.code.toLowerCase())
  ) {
    return true;
  }
  if (authError.status === 401 || authError.status === 403) return true;
  const message = authError.message?.toLowerCase() ?? "";
  return (
    message.includes("auth session missing") ||
    message.includes("session expired") ||
    message.includes("refresh_token_not_found") ||
    message.includes("refresh token not found") ||
    message.includes("refresh_token_already_used") ||
    message.includes("refresh token already used")
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isExtractionSchema(value: unknown): value is ExtractionSchema {
  if (!isObject(value)) return false;
  const description = value.description;
  const status = value.status;
  return (
    typeof value.id === "string" &&
    isCanonicalSchemaId(value.id) &&
    typeof value.name === "string" &&
    (typeof description === "string" || description === null) &&
    typeof value.type === "string" &&
    typeof value.category === "string" &&
    isObject(value.text) &&
    isObject(value.dates) &&
    (status === null ||
      (typeof status === "string" && SCHEMA_STATUSES.has(status))) &&
    typeof value.is_verified === "boolean" &&
    typeof value.created_at === "string" &&
    typeof value.updated_at === "string" &&
    (typeof value.user_id === "string" || value.user_id === null)
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

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) =>
    character.charCodeAt(0)
  ) as Uint8Array<ArrayBuffer>;
}

export function encodeSchemaSnapshot(schema: ExtractionSchema): string {
  return bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify(schema))
  );
}

export function decodeSchemaSnapshot(
  encoded: string,
  expectedId: string
): ExtractionSchema {
  try {
    const value: unknown = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encoded))
    );
    if (!isExtractionSchema(value) || value.id !== expectedId) {
      throw new Error("invalid");
    }
    return value;
  } catch {
    throw new Error("Invalid verified schema snapshot");
  }
}

function signingPayload(
  encoded: string,
  userId: string,
  path: string
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    `${userId.length}:${userId}${path.length}:${path}${encoded.length}:${encoded}`
  ) as Uint8Array<ArrayBuffer>;
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error("Schema snapshot signing secret is missing");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signSchemaSnapshot(
  encoded: string,
  userId: string,
  path: string,
  secret: string
): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSigningKey(secret),
    signingPayload(encoded, userId, path)
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifySchemaSnapshot(
  encoded: string,
  signature: string,
  userId: string,
  path: string,
  secret: string
): Promise<boolean> {
  if (!signature || !secret) return false;
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await importSigningKey(secret),
      base64UrlToBytes(signature),
      signingPayload(encoded, userId, path)
    );
  } catch {
    return false;
  }
}
