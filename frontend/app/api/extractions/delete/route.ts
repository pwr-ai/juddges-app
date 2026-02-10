import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  ValidationError,
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('extractions-delete-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

// Helper to extract error message and code from backend response
async function parseBackendError(response: Response): Promise<{ message: string; code: string }> {
  const defaultMessage = `Backend API error: ${response.status}`;
  const defaultCode = 'BACKEND_ERROR';

  try {
    const errorData = await response.json();
    const detail = errorData.detail;
    const message = typeof detail === 'string'
      ? detail
      : detail?.message || detail?.error || errorData.message || errorData.error || defaultMessage;
    const code = detail?.code || errorData.code || defaultCode;
    return { message, code };
  } catch {
    try {
      const text = await response.text();
      return { message: text || defaultMessage, code: defaultCode };
    } catch {
      return { message: defaultMessage, code: defaultCode };
    }
  }
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('DELETE /api/extractions/delete started', { requestId });

    const { searchParams } = new URL(request.url);
    const job_id = searchParams.get('job_id');

    if (!job_id) {
      throw new ValidationError("job_id query parameter is required");
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to delete an extraction job");
    }

    // Call the backend API to delete the job with timeout
    const backendUrl = `${API_BASE_URL}/extractions/${job_id}/delete`;
    apiLogger.info('Calling backend DELETE endpoint', { requestId, job_id, backendUrl });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    let response: Response;
    try {
      response = await fetch(
        backendUrl,
        {
          method: 'DELETE',
          headers: {
            'X-API-Key': API_KEY,
            'X-User-ID': userData.user.id
          },
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);
      apiLogger.info('Backend DELETE response received', { requestId, job_id, status: response.status });
    } catch (error) {
      clearTimeout(timeoutId);
      apiLogger.error('Backend DELETE request failed', error, { requestId, job_id, backendUrl });
      if (error instanceof Error && error.name === 'AbortError') {
        throw new AppError(
          "Request timed out. The backend service may be slow or unavailable.",
          ErrorCode.INTERNAL_ERROR,
          504
        );
      }
      throw error;
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

    const deleteResult = await response.json();
    apiLogger.info('Backend delete result', { requestId, job_id, deleteResult });

    apiLogger.info('DELETE /api/extractions/delete completed', {
      requestId,
      job_id,
      status: deleteResult.status
    });

    return NextResponse.json({
      job_id: deleteResult.task_id || job_id,
      status: deleteResult.status,
      message: deleteResult.message
    });
  } catch (error) {
    apiLogger.error("Error in DELETE extractions/delete route", error);

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to delete extraction job",
        ErrorCode.INTERNAL_ERROR,
        500
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}


