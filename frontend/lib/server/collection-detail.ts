import { getBackendUrl } from "@/app/api/utils/backend-url";
import { createClient } from "@/lib/supabase/server";
import type { CollectionWithDocuments } from "@/types/collection";

const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;
const COLLECTION_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,255}$/;
const COLLECTION_REQUEST_TIMEOUT_MS = 10_000;

export type CollectionDetailResult =
  | { kind: "ok"; collection: CollectionWithDocuments }
  | { kind: "invalid" }
  | { kind: "unauthenticated" }
  | { kind: "not_found" }
  | {
      kind: "unavailable";
      status: number;
      reason: "upstream_auth" | "upstream" | "timeout" | "transport";
    };

export interface LoadCollectionDetailOptions {
  limit?: number;
  offset?: number;
}

export class CollectionDetailUnavailableError extends Error {
  readonly status: number;
  readonly reason: "upstream_auth" | "upstream" | "timeout" | "transport";

  constructor(
    status: number,
    reason: "upstream_auth" | "upstream" | "timeout" | "transport"
  ) {
    super("Collection service unavailable");
    this.name = "CollectionDetailUnavailableError";
    this.status = status;
    this.reason = reason;
  }
}

export function isValidCollectionId(id: string): boolean {
  return COLLECTION_ID_PATTERN.test(id);
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export async function loadCollectionDetail(
  id: string,
  options: LoadCollectionDetailOptions = {}
): Promise<CollectionDetailResult> {
  if (!isValidCollectionId(id)) {
    return { kind: "invalid" };
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { kind: "unauthenticated" };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return { kind: "unauthenticated" };
  }

  const params = new URLSearchParams();
  if (options.limit !== undefined) {
    params.set("limit", String(options.limit));
  }
  if (options.offset !== undefined) {
    params.set("offset", String(options.offset));
  }
  const query = params.toString();

  try {
    const response = await fetch(
      `${API_BASE_URL}/collections/${id}${query ? `?${query}` : ""}`,
      {
        cache: "no-store",
        headers: {
          "X-API-Key": API_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(COLLECTION_REQUEST_TIMEOUT_MS),
      }
    );

    if (response.status === 404) {
      return { kind: "not_found" };
    }
    if (!response.ok) {
      return {
        kind: "unavailable",
        status: response.status,
        reason:
          response.status === 401 || response.status === 403
            ? "upstream_auth"
            : "upstream",
      };
    }

    const collection = (await response.json()) as CollectionWithDocuments;
    if (collection.user_id !== user.id) {
      return { kind: "not_found" };
    }

    return { kind: "ok", collection };
  } catch (error) {
    if (isTimeoutError(error)) {
      return { kind: "unavailable", status: 504, reason: "timeout" };
    }
    return { kind: "unavailable", status: 502, reason: "transport" };
  }
}
