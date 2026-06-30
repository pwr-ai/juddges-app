import { ErrorCode } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Error code to user-friendly message mapping
 */
export const ERROR_MESSAGES: Record<string, string> = {
  [ErrorCode.EMPTY_DOCUMENT_LIST]: "The selected collection is empty. Please add documents to the collection before starting extraction.",
  EMPTY_COLLECTION: "The selected collection is empty. Please add documents to the collection before starting extraction.",
  [ErrorCode.MISSING_REQUIRED_FIELD]: "Please ensure both collection and schema are selected.",
  MISSING_SCHEMA_ID: "Please ensure both collection and schema are selected.",
  MISSING_COLLECTION_ID: "Please ensure both collection and schema are selected.",
  [ErrorCode.UNAUTHORIZED]: "Your session has expired. Please log in again.",
  [ErrorCode.TASK_SUBMISSION_FAILED]: "The extraction service is temporarily unavailable. Please try again in a few moments.",
  BACKEND_ERROR: "The extraction service is temporarily unavailable. Please try again in a few moments.",
  [ErrorCode.VECTOR_DB_UNAVAILABLE]: "The vector database service is currently unavailable. Please check the service status and try again later.",
  [ErrorCode.LLM_SERVICE_UNAVAILABLE]: "The AI service is currently unavailable. Please try again later.",
  [ErrorCode.DATABASE_UNAVAILABLE]: "The database service is currently unavailable. Please try again later.",
  [ErrorCode.VALIDATION_ERROR]: "The request contains invalid data. Please check your inputs.",
  [ErrorCode.INTERNAL_ERROR]: "An internal error occurred. Please try again or contact support.",
};

/**
 * HTTP status code to default error message mapping
 */
export const STATUS_MESSAGES: Record<number, string> = {
  400: "The request contains invalid data. Please check your inputs.",
  401: "Your session has expired. Please log in again.",
  403: "You don't have permission to perform this action.",
  404: "The requested resource was not found.",
  429: "Too many requests. Please try again later.",
  500: "An internal server error occurred. Please try again or contact support.",
  503: "The extraction service is temporarily unavailable. Please try again in a few moments.",
};

/**
 * Parse error response from API
 */
interface ParsedError {
  errorTitle: string;
  errorMessage: string;
  errorCode: string | null;
}

export function parseErrorResponse(
  response: Response,
  errorData: unknown
): ParsedError {
  let errorTitle = "Extraction Failed";
  let errorMessage = STATUS_MESSAGES[response.status] || `Server returned error status ${response.status}`;
  let errorCode: string | null = null;

  if (!errorData || typeof errorData !== 'object') {
    return { errorTitle, errorMessage, errorCode };
  }

  const error = errorData as Record<string, unknown>;

  // Extract error title
  if (error.error && typeof error.error === 'string') {
    errorTitle = error.error;
  }

  // Track parsed details for nested error code checking
  let parsedDetails: Record<string, unknown> | null = null;

  // Parse error details
  if (error.details) {
    if (typeof error.details === 'string') {
      // Try to parse details as JSON if it's a string
      try {
        parsedDetails = JSON.parse(error.details);
        if (parsedDetails && typeof parsedDetails === 'object' && parsedDetails.message) {
          errorMessage = parsedDetails.message as string;
          if (parsedDetails.error && typeof parsedDetails.error === 'string' && !errorTitle) {
            errorTitle = parsedDetails.error;
          }
        } else {
          errorMessage = error.details;
        }
      } catch {
        // If parsing fails, use the string as-is
        errorMessage = error.details;
      }
    } else if (typeof error.details === 'object' && error.details !== null) {
      const details = error.details as Record<string, unknown>;
      if ('issues' in details && Array.isArray(details.issues)) {
        // Format Zod validation errors nicely
        errorMessage = (details.issues as Array<{ path: string; message: string }>)
          .map((issue) => `${issue.path}: ${issue.message}`)
          .join(', ');
      } else if ('message' in details && typeof details.message === 'string') {
        // If details is an object with a message property
        errorMessage = details.message;
        parsedDetails = details;
      } else {
        errorMessage = JSON.stringify(error.details, null, 2);
      }
    } else {
      errorMessage = JSON.stringify(error.details, null, 2);
    }
  } else if (error.debug) {
    errorMessage = typeof error.debug === 'string'
      ? error.debug
      : JSON.stringify(error.debug, null, 2);
  }

  // Extract error code (check both top-level and nested)
  errorCode = (error.code && typeof error.code === 'string')
    ? error.code
    : (parsedDetails && typeof parsedDetails === 'object' && parsedDetails.code && typeof parsedDetails.code === 'string')
      ? parsedDetails.code
      : null;

  // Apply error code-specific message if available
  if (errorCode && ERROR_MESSAGES[errorCode]) {
    const codeMessage = ERROR_MESSAGES[errorCode];
    // Only override if we don't have a good message yet or if it's a generic status message
    if (!errorMessage || errorMessage === `Server returned error status ${response.status}`) {
      errorMessage = codeMessage;
    }
  }

  // Fallback to status-based message if we still have a generic message
  if (response.status === 503 && (!errorMessage || errorMessage === `Server returned error status ${response.status}`)) {
    errorMessage = STATUS_MESSAGES[503] || errorMessage;
  }

  return { errorTitle, errorMessage, errorCode };
}

/**
 * Handle a non-ok extraction response: parse the error body, log it, and return
 * the user-facing message to surface via a toast. Mirrors the inline handling
 * that previously lived in the extract page's handleExtract.
 */
export async function getExtractionErrorMessage(response: Response): Promise<string> {
  try {
    const errorData = await response.json();
    const parsedError = parseErrorResponse(response, errorData);

    // Extract parsedDetails for logging (if available)
    let parsedDetails: Record<string, unknown> | null = null;
    if (errorData && typeof errorData === 'object') {
      const error = errorData as Record<string, unknown>;
      if (error.details && typeof error.details === 'object') {
        parsedDetails = error.details as Record<string, unknown>;
      } else if (error.details && typeof error.details === 'string') {
        try {
          parsedDetails = JSON.parse(error.details);
        } catch {
          // Ignore parse errors
        }
      }
    }

    logError(response, errorData, parsedDetails);

    return parsedError.errorMessage;
  } catch (parseError) {
    logger.error("Failed to parse error response: ", parseError);
    return STATUS_MESSAGES[response.status]
      || `Server error (${response.status}). ${response.statusText || 'Please try again or contact support.'}`;
  }
}

/**
 * Log error information for debugging
 */
export function logError(response: Response, errorData: unknown, parsedDetails: Record<string, unknown> | null): void {
  const errorLog: Record<string, unknown> = {
    status: response.status,
  };

  if (errorData && typeof errorData === 'object') {
    const error = errorData as Record<string, unknown>;
    if ('code' in error) errorLog.code = error.code;
    if ('error' in error) errorLog.error = error.error;
    if ('details' in error) {
      if (parsedDetails) {
        errorLog.details = error.details;
        errorLog.parsedDetails = parsedDetails;
      } else {
        errorLog.details = error.details;
      }
    }
    if ('debug' in error) errorLog.debug = error.debug;
    // Log the full errorData if it has unexpected structure
    if (Object.keys(error).length > 0 && Object.keys(errorLog).length <= 1) {
      errorLog.fullErrorData = errorData;
    }
  } else {
    errorLog.rawErrorData = errorData;
  }

  logger.error("Extraction error: ", errorLog);
}
