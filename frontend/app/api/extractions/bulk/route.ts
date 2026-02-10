import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  UnauthorizedError,
  AppError,
  ErrorCode,
} from '@/lib/errors';

const apiLogger = logger.child('bulk-extractions-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('POST /api/extractions/bulk started', { requestId });

    const body = await request.json();
    const {
      collection_id,
      schema_ids,
      document_ids,
      extraction_context,
      language,
      auto_export,
      scheduled_at,
    } = body;

    if (!collection_id || !schema_ids || !Array.isArray(schema_ids) || schema_ids.length === 0) {
      return NextResponse.json(
        { error: "collection_id and at least one schema_id are required" },
        { status: 400 }
      );
    }

    if (schema_ids.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 schemas allowed per bulk extraction" },
        { status: 400 }
      );
    }

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to start a bulk extraction");
    }

    // Resolve document IDs if not provided
    let resolvedDocumentIds: string[] = document_ids || [];

    if (resolvedDocumentIds.length === 0) {
      try {
        const response = await fetch(`${API_BASE_URL}/collections/${collection_id}/documents`, {
          headers: {
            'X-API-Key': API_KEY,
            'X-User-ID': userData.user.id,
          } as HeadersInit,
        });

        if (!response.ok) {
          throw new Error(`Backend returned status ${response.status}`);
        }

        const documents = await response.json();
        if (!documents || documents.length === 0) {
          return NextResponse.json(
            { error: "The selected collection contains no documents" },
            { status: 400 }
          );
        }

        resolvedDocumentIds = documents.map((doc: { document_id: string }) => doc.document_id);
      } catch (error) {
        apiLogger.error("Error fetching documents for bulk extraction", error, { requestId });
        return NextResponse.json(
          { error: "Failed to fetch documents from collection" },
          { status: 500 }
        );
      }
    }

    // Call the backend bulk extraction endpoint
    const backendPayload = {
      collection_id,
      schema_ids,
      document_ids: resolvedDocumentIds,
      extraction_context: extraction_context || 'Extract structured information from legal documents using the provided schema.',
      language: language || 'pl',
      auto_export: auto_export || false,
      scheduled_at: scheduled_at || null,
    };

    const response = await fetch(`${API_BASE_URL}/extractions/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
      },
      body: JSON.stringify(backendPayload),
    });

    if (!response.ok) {
      let errorDetails = `Backend error: ${response.status}`;
      try {
        const errorData = await response.json();
        errorDetails = errorData.detail?.message || errorData.detail || errorDetails;
      } catch {
        // Use default error message
      }

      apiLogger.error("Backend bulk extraction error", { requestId, status: response.status, errorDetails });
      return NextResponse.json(
        { error: errorDetails },
        { status: response.status === 503 ? 503 : 500 }
      );
    }

    const bulkResult = await response.json();

    // Store each job in Supabase for tracking
    const acceptedJobs = bulkResult.jobs?.filter((j: { status: string }) => j.status === 'accepted') || [];
    for (const job of acceptedJobs) {
      try {
        await supabase.from('extraction_jobs').insert({
          job_id: job.job_id,
          user_id: userData.user.id,
          collection_id,
          schema_id: job.schema_id,
          status: 'PENDING',
          document_ids: resolvedDocumentIds,
          total_documents: resolvedDocumentIds.length,
          completed_documents: 0,
          language: language || 'pl',
          prompt_id: 'info_extraction',
          extraction_context: extraction_context || 'Extract structured information from legal documents using the provided schema.',
        });
      } catch (error) {
        apiLogger.error('Failed to create job tracking record', error, {
          requestId,
          jobId: job.job_id,
          schemaId: job.schema_id,
        });
      }
    }

    apiLogger.info('POST /api/extractions/bulk completed', {
      requestId,
      bulkId: bulkResult.bulk_id,
      acceptedJobs: acceptedJobs.length,
      totalSchemas: bulkResult.total_schemas,
    });

    return NextResponse.json(bulkResult);
  } catch (error) {
    apiLogger.error("Error in bulk extractions route", error, { requestId });

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "An unexpected error occurred during bulk extraction",
        ErrorCode.INTERNAL_ERROR,
        500
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
