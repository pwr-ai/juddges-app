import type { ExtractionSchema } from "@/types/extraction_schemas";
import {
  isCanonicalSchemaId,
  normalizeExtractionSchema,
} from "@/lib/schemas/detail-transport";
import logger from "@/lib/logger";

const schemaLogger = logger.child("schema-detail");
const SCHEMA_DETAIL_SELECT =
  "id,name,description,type,category,text,dates,status,is_verified,created_at,updated_at,user_id";

export type SchemaDetailFailureReason =
  | "upstream_auth"
  | "upstream"
  | "timeout"
  | "transport"
  | "malformed";

export class SchemaDetailNotFoundError extends Error {
  constructor() {
    super("Schema not found");
    this.name = "SchemaDetailNotFoundError";
  }
}

export class SchemaDetailUpstreamError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly reason: SchemaDetailFailureReason
  ) {
    super(message);
    this.name = "SchemaDetailUpstreamError";
  }
}

interface SchemaDetailFetchOptions {
  enrichCreator?: boolean;
}

function timeoutMs(): number {
  const configured = Number(process.env.SCHEMA_DETAIL_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(configured) && configured > 0 ? configured : 10_000;
}

function isTimeoutFailure(error: unknown, signal: AbortSignal): boolean {
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return true;
  }
  return (
    signal.aborted &&
    typeof signal.reason === "object" &&
    signal.reason !== null &&
    "name" in signal.reason &&
    signal.reason.name === "TimeoutError"
  );
}

function combineSignals(
  requestSignal: AbortSignal | undefined,
  timeoutSignal: AbortSignal
): AbortSignal {
  if (!requestSignal) return timeoutSignal;
  const controller = new AbortController();
  const forwardAbort = (source: AbortSignal) => {
    if (!controller.signal.aborted) controller.abort(source.reason);
  };
  if (requestSignal.aborted) forwardAbort(requestSignal);
  else {
    requestSignal.addEventListener("abort", () => forwardAbort(requestSignal), {
      once: true,
    });
  }
  if (timeoutSignal.aborted) forwardAbort(timeoutSignal);
  else {
    timeoutSignal.addEventListener("abort", () => forwardAbort(timeoutSignal), {
      once: true,
    });
  }
  return controller.signal;
}

export async function fetchSchemaDetail(
  schemaId: string,
  accessToken: string,
  requestSignal?: AbortSignal,
  options: SchemaDetailFetchOptions = {}
): Promise<ExtractionSchema> {
  if (!isCanonicalSchemaId(schemaId)) {
    throw new SchemaDetailNotFoundError();
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs());
  const signal = combineSignals(requestSignal, timeoutSignal);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new SchemaDetailUpstreamError(
      "Schema service is not configured.",
      500,
      "upstream"
    );
  }

  const query = new URLSearchParams({
    select: SCHEMA_DETAIL_SELECT,
    id: `eq.${schemaId}`,
    limit: "1",
  });

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/extraction_schemas?${query.toString()}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
        signal,
      }
    );

    if (!response.ok) {
      const upstreamAuth = response.status === 401 || response.status === 403;
      throw new SchemaDetailUpstreamError(
        upstreamAuth
          ? "Schema service authorization failed."
          : "Schema service failed while loading the schema.",
        response.status >= 500 || upstreamAuth ? response.status : 502,
        upstreamAuth ? "upstream_auth" : "upstream"
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SchemaDetailUpstreamError(
        "Schema service returned malformed data.",
        502,
        "malformed"
      );
    }

    if (payload === null || (Array.isArray(payload) && payload.length === 0)) {
      throw new SchemaDetailNotFoundError();
    }
    if (!Array.isArray(payload) || payload.length !== 1) {
      throw new SchemaDetailUpstreamError(
        "Schema service returned malformed data.",
        502,
        "malformed"
      );
    }
    const schema = normalizeExtractionSchema(payload[0]);
    if (!schema || schema.id !== schemaId) {
      throw new SchemaDetailUpstreamError(
        "Schema service returned malformed data.",
        502,
        "malformed"
      );
    }
    if (!schema.user_id || options.enrichCreator === false) return schema;

    const profileQuery = new URLSearchParams({
      select: "email",
      id: `eq.${schema.user_id}`,
      limit: "1",
    });
    try {
      const profileResponse = await fetch(
        `${supabaseUrl}/rest/v1/user_profiles?${profileQuery.toString()}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
          },
          cache: "no-store",
          signal,
        }
      );
      if (!profileResponse.ok) {
        schemaLogger.warn("Creator profile enrichment failed", {
          schemaId,
          status: profileResponse.status,
        });
        return schema;
      }
      const profiles: unknown = await profileResponse.json();
      if (
        Array.isArray(profiles) &&
        profiles.length === 1 &&
        typeof profiles[0] === "object" &&
        profiles[0] !== null &&
        "email" in profiles[0] &&
        typeof profiles[0].email === "string"
      ) {
        return { ...schema, user: { email: profiles[0].email } };
      }
      return schema;
    } catch (error) {
      schemaLogger.warn("Creator profile enrichment unavailable", {
        schemaId,
        reason: isTimeoutFailure(error, signal) ? "timeout" : "transport",
      });
      return schema;
    }
  } catch (error) {
    if (
      error instanceof SchemaDetailNotFoundError ||
      error instanceof SchemaDetailUpstreamError
    ) {
      throw error;
    }
    const timeout = isTimeoutFailure(error, signal);
    throw new SchemaDetailUpstreamError(
      timeout
        ? "Schema service timed out."
        : "Schema service is temporarily unavailable.",
      timeout ? 504 : 503,
      timeout ? "timeout" : "transport"
    );
  }
}
