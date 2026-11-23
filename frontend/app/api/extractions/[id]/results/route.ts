import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import { rateLimitIdentity } from '@/app/api/utils/rate-limit-identity';
import { parseBackendError } from '@/app/api/utils/parse-backend-error';
import logger from '@/lib/logger';
import { AppError, ErrorCode } from '@/lib/errors';
import {
  jobIdQuerySchema,
  extractionResultsQuerySchema,
  validateQueryParams,
} from '@/lib/validation/schemas';

const apiLogger = logger.child('extractions-results-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;
const RESULTS_TIMEOUT_MS = 15_000;

/**
 * One page of a job's per-document results. The detail page asks for
 * `limit` rows at a time instead of the whole (tens of MB) array.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);

    const { job_id } = validateQueryParams(jobIdQuerySchema, { job_id: id });
    const { offset, limit, status } = validateQueryParams(
      extractionResultsQuerySchema,
      {
        offset: searchParams.get('offset'),
        limit: searchParams.get('limit'),
        status: searchParams.get('status'),
      }
    );

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const query = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });
    if (status) query.set('status', status);

    let response: Response;
    try {
      response = await fetch(
        `${API_BASE_URL}/extractions/${job_id}/results?${query}`,
        {
          cache: 'no-store',
          headers: {
            'X-API-Key': API_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'X-RateLimit-Identity': rateLimitIdentity(userData.user.id),
          },
          signal: AbortSignal.timeout(RESULTS_TIMEOUT_MS),
        }
      );
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (error.name === 'TimeoutError' || error.name === 'AbortError');
      throw new AppError(
        timedOut
          ? 'The extraction service timed out. Please try again.'
          : 'The extraction service is unavailable. Please try again.',
        (timedOut ? 'EXTRACTION_TIMEOUT' : 'EXTRACTION_UNAVAILABLE') as ErrorCode,
        timedOut ? 504 : 503,
        { job_id }
      );
    }

    if (!response.ok) {
      const { message, code } = await parseBackendError(response);
      throw new AppError(
        message,
        code as ErrorCode,
        response.status,
        { job_id, original_status: response.status }
      );
    }

    let page: unknown;
    try {
      page = await response.json();
    } catch {
      throw new AppError(
        'The extraction service returned malformed data.',
        'MALFORMED_EXTRACTION_RESPONSE' as ErrorCode,
        502,
        { job_id }
      );
    }

    return NextResponse.json(page, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    apiLogger.error("Error in GET extraction results route", error);

    if (error instanceof AppError) {
      return NextResponse.json(error.toErrorDetail(), { status: error.statusCode });
    }

    return NextResponse.json(
      new AppError(
        "Failed to retrieve extraction results",
        ErrorCode.INTERNAL_ERROR,
        500,
        { original_error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
