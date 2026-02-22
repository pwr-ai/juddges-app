import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@/lib/supabase/server';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode
} from '@/lib/errors';

const apiLogger = logger.child('statistics-api');

export async function GET(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('GET /api/statistics started', { requestId });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Authentication required");
    }

    // Query judgment counts from Supabase
    const { count: totalDocuments, error: countError } = await supabase
      .from('judgments')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      apiLogger.error('Failed to count judgments', countError, { requestId });
    }

    const statistics = {
      totalDocuments: totalDocuments ?? 0,
      totalChunks: 0,
      documentTypes: [],
      countries: [],
      sampleDocument: null,
      computedAt: new Date().toISOString()
    };

    apiLogger.info('GET /api/statistics completed', { requestId });

    return NextResponse.json(statistics);

  } catch (error) {
    apiLogger.error("GET /api/statistics failed", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to fetch statistics",
        ErrorCode.INTERNAL_ERROR
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
