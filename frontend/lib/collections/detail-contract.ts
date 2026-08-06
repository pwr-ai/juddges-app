import type { CollectionWithDocuments } from "@/types/collection";

export const COLLECTION_SNAPSHOT_HEADER =
  "x-juddges-collection-snapshot";

const COLLECTION_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,255}$/;
const UNAUTHENTICATED_AUTH_CODES = new Set([
  "bad_jwt",
  "invalid_credentials",
  "no_authorization",
  "session_not_found",
  "session_expired",
  "refresh_token_not_found",
  "refresh_token_already_used",
]);

interface AuthLookupError {
  code?: string;
  message?: string;
  name?: string;
  status?: number;
}

export function isValidCollectionId(id: string): boolean {
  return COLLECTION_ID_PATTERN.test(id);
}

export function isUnauthenticatedAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const authError = error as AuthLookupError;
  if (authError.name === "AuthRetryableFetchError") {
    return false;
  }
  if (authError.status !== undefined && authError.status >= 500) {
    return false;
  }
  if (
    authError.code &&
    UNAUTHENTICATED_AUTH_CODES.has(authError.code.toLowerCase())
  ) {
    return true;
  }
  if (authError.status === 401 || authError.status === 403) {
    return true;
  }
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

export function encodeCollectionSnapshot(
  collection: CollectionWithDocuments
): string {
  const bytes = new TextEncoder().encode(JSON.stringify(collection));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeCollectionSnapshot(
  encoded: string | null,
  expectedId: string
): CollectionWithDocuments | null {
  if (!encoded) {
    return null;
  }
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0)
    );
    const value = JSON.parse(
      new TextDecoder().decode(bytes)
    ) as Partial<CollectionWithDocuments>;
    if (
      value.id !== expectedId ||
      typeof value.user_id !== "string" ||
      typeof value.name !== "string" ||
      !Array.isArray(value.documents) ||
      (value.document_count !== undefined &&
        typeof value.document_count !== "number")
    ) {
      return null;
    }
    return value as CollectionWithDocuments;
  } catch {
    return null;
  }
}
