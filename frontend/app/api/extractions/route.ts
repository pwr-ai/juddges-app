import { NextResponse, NextRequest } from "next/server";
import { createClient } from '@/lib/supabase/server';
import { DocumentExtractionResult } from "@/types/search";
import { getBackendUrl } from '@/app/api/utils/backend-url';
import logger from '@/lib/logger';
import {
  ValidationError,
  UnauthorizedError,
  DatabaseError,
  AppError,
  ErrorCode,
  type ApiResponse
} from '@/lib/errors';
import {
  extractionRequestSchema,
  jobIdQuerySchema,
  validateRequestBody,
  validateQueryParams
} from '@/lib/validation/schemas';

const apiLogger = logger.child('extractions-api');
const API_BASE_URL = getBackendUrl();
const API_KEY = process.env.BACKEND_API_KEY as string;

// Map backend status values to valid database status values
// Database constraint allows: PENDING, STARTED, SUCCESS, FAILURE
function mapStatusToDbStatus(backendStatus: string): string {
  const statusMap: Record<string, string> = {
    'PENDING': 'PENDING',
    'QUEUED': 'PENDING',
    'STARTED': 'STARTED',
    'IN_PROGRESS': 'STARTED',
    'PROCESSING': 'STARTED',
    'SUCCESS': 'SUCCESS',
    'COMPLETED': 'SUCCESS',
    'PARTIALLY_COMPLETED': 'SUCCESS',
    'FAILURE': 'FAILURE',
    'FAILED': 'FAILURE',
    'CANCELLED': 'FAILURE',
    'CANCELED': 'FAILURE',
  };
  return statusMap[backendStatus] || 'PENDING';
}

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

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('POST /api/extractions started', { requestId });

    // Parse and validate request body with Zod
    const body = await request.json();
    const { collection_id, schema_id, document_ids, extraction_context, language, additional_instructions } = validateRequestBody(
      extractionRequestSchema,
      body
    );

    // Get the authenticated user
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to start an extraction");
    }

    // Use provided document_ids or get all documents from the collection
    // document_ids from frontend are document IDs (backend returns them directly)
    let documentIds: string[];

    if (document_ids && document_ids.length > 0) {
      // Frontend provides document IDs directly - just use them
      // Skip verification since backend already has these documents
      documentIds = document_ids;
      apiLogger.info('Using provided document IDs', {
        requestId,
        count: documentIds.length
      });
    } else {
      // Call backend to get all document IDs from the collection
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
          apiLogger.warn("Empty collection", { requestId, collection_id });
          throw new ValidationError(
            "The selected collection contains no documents. Please add documents before starting extraction.",
            { collection_id, code: ErrorCode.EMPTY_DOCUMENT_LIST }
          );
        }

        // Backend returns array of {id, document_id}
        documentIds = documents.map((doc: { document_id: string }) => doc.document_id);

        apiLogger.info('Retrieved document IDs from backend', {
          requestId,
          count: documentIds.length
        });
      } catch (error) {
        apiLogger.error("Error fetching documents from backend", error, {
          requestId,
          collection_id
        });
        throw new DatabaseError(
          "Failed to fetch documents from the collection.",
          { collection_id, originalError: error instanceof Error ? error.message : String(error) }
        );
      }
    }

    // Ensure extraction_context is always provided (required by backend)
    const finalExtractionContext = extraction_context || 'Extract structured information from legal documents using the provided schema.';

    // Call the backend API to start extraction
    // Updated: POST /extractions/db (new endpoint using InformationExtractorDB with schemas from Supabase)
    // Send document_ids to the backend
    const backendPayload: {
      collection_id: string;
      schema_id: string;
      document_ids: string[];
      extraction_context: string;
      language: string;
      additional_instructions?: string;
    } = {
      collection_id,
      schema_id,
      document_ids: documentIds,
      extraction_context: finalExtractionContext,
      language: language || 'pl'
    };

    // Add optional additional_instructions if provided
    if (additional_instructions) {
      backendPayload.additional_instructions = additional_instructions;
    }

    const response = await fetch(`${API_BASE_URL}/extractions/db`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify(backendPayload)
    });

    if (!response.ok) {
      // Try to parse error response from backend
      let errorDetails = `Backend service returned error status ${response.status}`;
      let errorCode = 'BACKEND_ERROR';

      try {
        const errorData = await response.json();
        if (errorData.detail) {
          errorDetails = typeof errorData.detail === 'string'
            ? errorData.detail
            : JSON.stringify(errorData.detail);
        }
        if (errorData.code) {
          errorCode = errorData.code;
        }
      } catch {
        // If we can't parse the error, use the status text
        errorDetails = `${errorDetails}: ${response.statusText}`;
      }

      apiLogger.error("Backend API error", {
        requestId,
        status: response.status,
        details: errorDetails,
        collection_id,
        schema_id
      });

      // Map specific status codes to user-friendly messages
      const statusMessages: Record<number, { error: string; details: string }> = {
        400: {
          error: "Invalid Request",
          details: errorDetails || "The extraction request contains invalid data. Please check your inputs."
        },
        404: {
          error: "Resource Not Found",
          details: errorDetails || "The requested schema or collection was not found."
        },
        503: {
          error: "Service Unavailable",
          details: errorDetails || "The extraction service is temporarily unavailable. Please try again later."
        },
        500: {
          error: "Extraction Service Error",
          details: errorDetails || "The extraction service encountered an internal error. Please try again or contact support."
        }
      };

      const errorResponse = statusMessages[response.status] || {
        error: "Extraction Failed",
        details: errorDetails
      };

      return NextResponse.json(
        {
          ...errorResponse,
          code: errorCode,
          status: response.status
        },
        { status: response.status === 503 ? 503 : 500 }
      );
    }

    const extractionResults = await response.json();
    const jobId = extractionResults.job_id || extractionResults.task_id;

    if (!jobId) {
      apiLogger.error("Backend did not return a job ID", {
        requestId,
        extractionResults
      });
      throw new AppError(
        "Backend did not return a valid job ID. Please try again or contact support.",
        ErrorCode.INTERNAL_ERROR,
        500,
        { extractionResults }
      );
    }

    // Store job in Supabase for tracking
    try {
      await supabase.from('extraction_jobs').insert({
        job_id: jobId,
        user_id: userData.user.id,
        collection_id,
        schema_id,
        status: 'PENDING',
        document_ids: documentIds,
        total_documents: documentIds.length,
        completed_documents: 0,
        language: language || 'pl',
        prompt_id: 'info_extraction',  // Default prompt template
        extraction_context: extraction_context || 'Extract structured information from legal documents using the provided schema.',
      });
    } catch (error) {
      apiLogger.error('Failed to create job tracking record', error, { requestId, jobId });
      // Don't fail the request if job tracking fails
    }

    apiLogger.info('POST /api/extractions completed', {
      requestId,
      jobId,
      collection_id,
      schema_id
    });

    // Updated: Backend now returns job_id instead of task_id
    return NextResponse.json({
      job_id: jobId,
      status: extractionResults.status,
      message: extractionResults.message || 'Extraction job created successfully'
    });
  } catch (error) {
    apiLogger.error("Error in extractions route", error, { requestId });

    // Handle known error types
    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    // Handle unexpected errors
    return NextResponse.json(
      new AppError(
        "An unexpected error occurred while processing your request. Please try again.",
        ErrorCode.INTERNAL_ERROR,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Validate query parameters with Zod
    const { job_id } = validateQueryParams(jobIdQuerySchema, {
      job_id: searchParams.get('job_id')
    });

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Call the backend API to get extraction status and results
    const response = await fetch(
      `${API_BASE_URL}/extractions/${job_id}`,
      {
        headers: {
          'X-API-Key': API_KEY
        }
      }
    );

    if (!response.ok) {
      const { message, code } = await parseBackendError(response);
      throw new AppError(
        message,
        code as ErrorCode,
        response.status,
        { job_id, original_status: response.status }
      );
    }

    const jobData = await response.json();

    // Update job status in Supabase
    try {
      const updateData: {
        status: string;
        updated_at: string;
        completed_documents?: number;
        results?: unknown[];
        completed_at?: string;
      } = {
        status: mapStatusToDbStatus(jobData.status),
        updated_at: new Date().toISOString(),
      };

      if (jobData.results && jobData.results.length > 0) {
        // Count all processed documents (both completed and failed) as completed_documents
        // This represents documents that have finished processing, regardless of success/failure
        const processedCount = jobData.results.filter(
          (r: { status: string }) => 
            r.status === 'completed' || 
            r.status === 'failed' || 
            r.status === 'partially_completed'
        ).length;
        updateData.completed_documents = processedCount;
        updateData.results = jobData.results;
      }

      // Update completed_at for terminal states (SUCCESS, FAILURE, COMPLETED, PARTIALLY_COMPLETED)
      if (jobData.status === 'SUCCESS' || 
          jobData.status === 'FAILURE' || 
          jobData.status === 'COMPLETED' || 
          jobData.status === 'PARTIALLY_COMPLETED') {
        updateData.completed_at = new Date().toISOString();
      }

      const { data: updateResult, error: updateError } = await supabase
        .from('extraction_jobs')
        .update(updateData)
        .eq('job_id', job_id)
        .select();

      if (updateError) {
        apiLogger.error('Failed to update job status in Supabase', updateError, { 
          job_id, 
          updateData 
        });
      } else if (!updateResult || updateResult.length === 0) {
        apiLogger.warn('No rows updated in Supabase - job might not exist or job_id mismatch', { 
          job_id,
          updateData,
          backendStatus: jobData.status
        });
      } else {
        apiLogger.info('Successfully updated job status in Supabase', { 
          job_id, 
          status: jobData.status,
          completed_documents: updateData.completed_documents,
          updatedRows: updateResult.length,
          oldStatus: updateResult[0]?.status,
          newStatus: updateData.status
        });
      }
    } catch (error) {
      apiLogger.error('Failed to update job status', error, { job_id });
    }

    // Extract results from the response
    const extractions: DocumentExtractionResult[] = jobData.results || [];

    // Fetch job metadata from Supabase to get collection_name and schema_name
    let collection_id: string | null = null;
    let collection_name: string | null = null;
    let schema_id: string | null = null;
    let schema_name: string | null = null;

    try {
      // Get job record with collection and schema IDs
      const { data: jobRecord } = await supabase
        .from('extraction_jobs')
        .select('collection_id, schema_id')
        .eq('job_id', job_id)
        .single();

      if (jobRecord) {
        // Store IDs
        collection_id = jobRecord.collection_id || null;
        schema_id = jobRecord.schema_id || null;

        // Fetch collection name
        if (jobRecord.collection_id) {
          const { data: collection } = await supabase
            .from('collections')
            .select('name')
            .eq('id', jobRecord.collection_id)
            .single();
          collection_name = collection?.name || null;
        }

        // Fetch schema name
        if (jobRecord.schema_id) {
          const { data: schema } = await supabase
            .from('extraction_schemas')
            .select('name')
            .eq('id', jobRecord.schema_id)
            .single();
          schema_name = schema?.name || null;
        }
      }
    } catch (metadataError) {
      apiLogger.warn('Failed to fetch job metadata for collection/schema names', {
        job_id,
        error: metadataError
      });
    }

    // Return job status with enriched metadata
    return NextResponse.json({
      job_id: jobData.job_id || job_id,
      status: jobData.status,
      results: extractions,
      progress: jobData.progress,
      created_at: jobData.created_at,
      updated_at: jobData.updated_at,
      collection_id,
      collection_name,
      schema_id,
      schema_name
    });
  } catch (error) {
    apiLogger.error("Error in GET extractions route", error);

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    // For other errors, preserve the error message if available
    const errorMessage = error instanceof Error ? error.message : "Failed to retrieve extraction job";
    return NextResponse.json(
      new AppError(
        errorMessage,
        ErrorCode.INTERNAL_ERROR,
        500,
        { original_error: error instanceof Error ? error.message : String(error) }
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    apiLogger.info('DELETE /api/extractions started', { requestId });

    const { searchParams } = new URL(request.url);
    const job_id = searchParams.get('job_id');

    if (!job_id) {
      throw new ValidationError("job_id query parameter is required");
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      throw new UnauthorizedError("Please log in to cancel an extraction job");
    }

    // Call the backend API to cancel the job with timeout
    const backendUrl = `${API_BASE_URL}/extractions/${job_id}`;
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

    const cancelResult = await response.json();
    apiLogger.info('Backend cancel result', { requestId, job_id, cancelResult });

    // Backend handles Supabase deletion, no need to do it here

    apiLogger.info('DELETE /api/extractions completed', {
      requestId,
      job_id,
      status: cancelResult.status
    });

    return NextResponse.json({
      job_id: cancelResult.task_id || job_id,
      status: cancelResult.status,
      message: cancelResult.message
    });
  } catch (error) {
    apiLogger.error("Error in DELETE extractions route", error);

    if (error instanceof AppError) {
      return NextResponse.json(
        error.toErrorDetail(),
        { status: error.statusCode }
      );
    }

    return NextResponse.json(
      new AppError(
        "Failed to cancel extraction job",
        ErrorCode.INTERNAL_ERROR,
        500
      ).toErrorDetail(),
      { status: 500 }
    );
  }
}
