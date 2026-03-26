/**
 * Standardized error handling for the frontend application.
 *
 * This module provides consistent error classes and response formats
 * for all API routes and client-side error handling.
 */

/**
 * Standardized error codes matching backend ErrorCode enum
 */
export enum ErrorCode {
  // Validation errors (400)
  VALIDATION_ERROR = "VALIDATION_ERROR",
  EMPTY_DOCUMENT_LIST = "EMPTY_DOCUMENT_LIST",
  INVALID_COLLECTION_ID = "INVALID_COLLECTION_ID",
  INVALID_SCHEMA_ID = "INVALID_SCHEMA_ID",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",

  // Not found errors (404)
  SCHEMA_NOT_FOUND = "SCHEMA_NOT_FOUND",
  COLLECTION_NOT_FOUND = "COLLECTION_NOT_FOUND",
  DOCUMENT_NOT_FOUND = "DOCUMENT_NOT_FOUND",
  JOB_NOT_FOUND = "JOB_NOT_FOUND",
  CHAT_NOT_FOUND = "CHAT_NOT_FOUND",
  NOT_FOUND = "NOT_FOUND",

  // External service errors (503)
  DATABASE_UNAVAILABLE = "DATABASE_UNAVAILABLE",
  VECTOR_DB_UNAVAILABLE = "VECTOR_DB_UNAVAILABLE",
  LLM_SERVICE_UNAVAILABLE = "LLM_SERVICE_UNAVAILABLE",

  // Task/Processing errors (500/503)
  TASK_SUBMISSION_FAILED = "TASK_SUBMISSION_FAILED",
  GENERATION_TIMEOUT = "GENERATION_TIMEOUT",
  EXTRACTION_FAILED = "EXTRACTION_FAILED",

  // Rate limiting (429)
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",

  // Authentication/Authorization (401/403)
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",

  // Generic errors (500)
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

/**
 * Standardized error response format
 */
export interface ErrorDetail {
  /** Short error title/type */
  error: string;
  /** Detailed user-friendly error message */
  message: string;
  /** Machine-readable error code for client handling */
  code: ErrorCode;
  /** Additional context about the error */
  details?: Record<string, unknown>;
}

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse(response: unknown): response is ErrorDetail {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    'message' in response &&
    'code' in response
  );
}

/**
 * Base application error class with HTTP status code support
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';

    // Maintains proper stack trace for where error was thrown (only available in V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Convert to ErrorDetail format
   */
  toErrorDetail(): ErrorDetail {
    return {
      error: this.code,
      message: this.message,
      code: this.code,
      details: this.details
    };
  }

  /**
   * Convert to JSON response
   */
  toJSON(): ErrorDetail {
    return this.toErrorDetail();
  }
}

/**
 * Validation error (400)
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Empty collection error (400)
 */
export class EmptyCollectionError extends AppError {
  constructor(collectionId: string) {
    super(
      `Collection '${collectionId}' contains no documents`,
      ErrorCode.EMPTY_DOCUMENT_LIST,
      400,
      { collectionId }
    );
    this.name = 'EmptyCollectionError';
  }
}

/**
 * Schema not found error (404)
 */
export class SchemaNotFoundError extends AppError {
  constructor(schemaId: string) {
    super(
      `Schema '${schemaId}' not found`,
      ErrorCode.SCHEMA_NOT_FOUND,
      404,
      { schemaId }
    );
    this.name = 'SchemaNotFoundError';
  }
}

/**
 * Collection not found error (404)
 */
export class CollectionNotFoundError extends AppError {
  constructor(collectionId: string) {
    super(
      `Collection '${collectionId}' not found`,
      ErrorCode.COLLECTION_NOT_FOUND,
      404,
      { collectionId }
    );
    this.name = 'CollectionNotFoundError';
  }
}

/**
 * Database error (503)
 */
export class DatabaseError extends AppError {
  constructor(message: string = "Database operation failed", details?: Record<string, unknown>) {
    super(message, ErrorCode.DATABASE_UNAVAILABLE, 503, details);
    this.name = 'DatabaseError';
  }
}

/**
 * Task submission error (503)
 */
export class TaskSubmissionError extends AppError {
  constructor(message: string = "Failed to submit task for processing", details?: Record<string, unknown>) {
    super(message, ErrorCode.TASK_SUBMISSION_FAILED, 503, details);
    this.name = 'TaskSubmissionError';
  }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
  constructor(message: string = "Rate limit exceeded. Please try again later.") {
    super(message, ErrorCode.RATE_LIMIT_EXCEEDED, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * Unauthorized error (401)
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = "Authentication required") {
    super(message, ErrorCode.UNAUTHORIZED, 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Helper to create appropriate error from backend response
 */
export function createErrorFromResponse(errorDetail: ErrorDetail): AppError {
  const { code, message, details } = errorDetail;

  switch (code) {
    case ErrorCode.VALIDATION_ERROR:
      return new ValidationError(message, details);
    case ErrorCode.EMPTY_DOCUMENT_LIST:
      return new ValidationError(message, details);
    case ErrorCode.SCHEMA_NOT_FOUND:
      return new AppError(message, code, 404, details);
    case ErrorCode.COLLECTION_NOT_FOUND:
      return new AppError(message, code, 404, details);
    case ErrorCode.DATABASE_UNAVAILABLE:
      return new DatabaseError(message, details);
    case ErrorCode.TASK_SUBMISSION_FAILED:
      return new TaskSubmissionError(message, details);
    case ErrorCode.RATE_LIMIT_EXCEEDED:
      return new RateLimitError(message);
    case ErrorCode.UNAUTHORIZED:
      return new UnauthorizedError(message);
    default:
      return new AppError(message, code, 500, details);
  }
}

/**
 * API Success Response type
 */
export interface ApiSuccessResponse<T> {
  data: T;
  message?: string;
}

/**
 * API Response type (success or error)
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ErrorDetail;

/**
 * Type guard for success response
 */
export function isSuccessResponse<T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> {
  return 'data' in response && !isErrorResponse(response);
}
