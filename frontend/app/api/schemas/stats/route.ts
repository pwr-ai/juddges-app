import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  DatabaseError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('schemas-stats-api');

/**
 * GET /api/schemas/stats - Get extraction job counts per schema
 * Returns a map of schema_id -> count of extraction jobs
 */
export async function GET(): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/schemas/stats started', { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Query extraction_jobs to count jobs per schema_id
    const { data: jobs, error: jobsError } = await supabase
      .from('extraction_jobs')
      .select('schema_id')
      .not('schema_id', 'is', null);

    if (jobsError) {
      apiLogger.error("Failed to fetch extraction jobs", jobsError, { requestId });
      throw new DatabaseError(
        `Failed to fetch extraction jobs: ${jobsError.message}`,
        { originalError: jobsError.message }
      );
    }

    // Count jobs per schema_id
    const stats: Record<string, number> = {};
    if (jobs) {
      for (const job of jobs) {
        if (job.schema_id) {
          stats[job.schema_id] = (stats[job.schema_id] || 0) + 1;
        }
      }
    }

    apiLogger.info('GET /api/schemas/stats completed', {
      requestId,
      schemaCount: Object.keys(stats).length
    });

    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });

  } catch (error) {
    apiLogger.error("GET /api/schemas/stats failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch schema statistics",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
