import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';

const apiLogger = logger.child('extractions-export-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID();

  try {
    const { id: jobId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'xlsx';

    apiLogger.info('GET /api/extractions/[id]/export started', {
      requestId,
      jobId,
      format
    });

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Call the backend export endpoint
    const backendUrl = `${API_BASE_URL}/extractions/${jobId}/export?format=${format}`;

    apiLogger.info('Calling backend export endpoint', {
      requestId,
      backendUrl
    });

    const response = await fetch(backendUrl, {
      headers: {
        'X-API-Key': API_KEY,
        'X-User-ID': userData.user.id,
      },
    });

    if (!response.ok) {
      let errorMessage = `Export failed with status ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail?.message || errorData.message || errorMessage;
      } catch {
        // Use default error message
      }

      apiLogger.error('Backend export failed', {
        requestId,
        jobId,
        status: response.status,
        error: errorMessage
      });

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // Get the file content as ArrayBuffer
    const fileBuffer = await response.arrayBuffer();

    // Get headers from backend response
    const contentDisposition = response.headers.get('Content-Disposition') ||
      `attachment; filename="extraction-${jobId}.${format}"`;
    const contentType = response.headers.get('Content-Type') ||
      (format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv; charset=utf-8');
    const rowsCount = response.headers.get('X-Rows-Count') || '0';

    apiLogger.info('Export successful', {
      requestId,
      jobId,
      format,
      rowsCount,
      contentType
    });

    // Return the file with proper headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
        'X-Rows-Count': rowsCount,
      },
    });

  } catch (error) {
    apiLogger.error('Error in export route', error, { requestId });

    return NextResponse.json(
      { error: "Failed to export extraction results" },
      { status: 500 }
    );
  }
}
