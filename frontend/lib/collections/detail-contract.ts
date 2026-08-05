import type { CollectionWithDocuments } from "@/types/collection";

export const COLLECTION_SNAPSHOT_HEADER =
  "x-juddges-collection-snapshot";

const COLLECTION_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,255}$/;
const MISSING_SESSION_CODES = new Set([
  "session_not_found",
  "refresh_token_not_found",
]);

interface AuthLookupError {
  code?: string;
  message?: string;
}

export function isValidCollectionId(id: string): boolean {
  return COLLECTION_ID_PATTERN.test(id);
}

export function isMissingAuthSessionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const authError = error as AuthLookupError;
  if (authError.code && MISSING_SESSION_CODES.has(authError.code)) {
    return true;
  }
  const message = authError.message?.toLowerCase() ?? "";
  return (
    message.includes("auth session missing") ||
    message.includes("refresh_token_not_found") ||
    message.includes("refresh token not found")
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
