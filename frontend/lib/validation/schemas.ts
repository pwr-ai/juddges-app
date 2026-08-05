/**
 * Zod validation schemas for API requests and responses.
 *
 * These schemas provide runtime validation, type inference, and automatic
 * error messages for all API interactions.
 */

import { z } from 'zod';
import { ValidationError } from '@/lib/errors';

// Re-export base validators (must come first to avoid circular dependencies)
export * from './base';

// Re-export schema-specific validators
export * from './schema-endpoints';
export * from './search-query-endpoints';

// Import base schemas for use in this file
import { uuidSchema, languageSchema } from './base';

/**
 * Extraction request schema (POST /api/extractions)
 */
export const extractionRequestSchema = z.object({
  collection_id: uuidSchema.describe('Unique identifier for the document collection'),
  schema_id: uuidSchema.describe('Unique identifier for the extraction schema'),
  document_ids: z
    .array(z.string().min(1, 'Document ID cannot be empty'))
    .min(1, 'At least one document must be selected')
    .optional()
    .describe('Optional list of document IDs. Accepts document IDs from backend.'),
  extraction_context: z
    .string()
    .min(1, 'Extraction context cannot be empty')
    .max(5000, 'Extraction context is too long (max 5000 characters)')
    .describe('Context to guide the extraction process (required)'),
  language: languageSchema.describe('Language for extraction (pl, en, or uk). Defaults to pl if not provided.'),
  additional_instructions: z
    .string()
    .max(5000, 'Additional instructions are too long (max 5000 characters)')
    .optional()
    .describe('Additional qualitative instructions for the extraction')
}).strict();

export type ExtractionRequest = z.infer<typeof extractionRequestSchema>;

/**
 * Job ID query parameter schema
 */
export const jobIdQuerySchema = z.object({
  job_id: uuidSchema.describe('Unique identifier for the extraction job')
}).strict();

export type JobIdQuery = z.infer<typeof jobIdQuerySchema>;

/**
 * Schema creation request
 */
export const schemaCreationRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  schema: z.record(z.string(), z.unknown()),
  is_public: z.boolean().default(false)
}).strict();

export type SchemaCreationRequest = z.infer<typeof schemaCreationRequestSchema>;

/**
 * Collection creation request
 */
export const collectionCreationRequestSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name is too long'),
  description: z.string().max(1000).optional(),
  document_ids: z.array(uuidSchema).min(1, 'At least one document is required')
}).strict();

export type CollectionCreationRequest = z.infer<typeof collectionCreationRequestSchema>;

/**
 * Search query request
 */
export const searchQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required').max(1000),
  collection_id: uuidSchema.optional(),
  limit: z.number().int().positive().max(100).default(10),
  offset: z.number().int().nonnegative().default(0),
  filters: z.object({
    document_type: z.string().optional(),
    date_from: z.string().datetime().optional(),
    date_to: z.string().datetime().optional(),
    language: languageSchema.optional()
  }).optional()
}).strict();

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/**
 * Chat message request
 */
export const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(10000),
  session_id: uuidSchema.optional(),
  context: z.record(z.string(), z.unknown()).optional()
}).strict();

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * Pagination parameters
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  per_page: z.coerce.number().int().positive().max(100).default(20)
});

export type Pagination = z.infer<typeof paginationSchema>;

/**
 * Document sample query parameters (GET /api/documents/sample)
 */
export const documentSampleQuerySchema = z.object({
  sample_size: z.coerce
    .number()
    .int('Sample size must be an integer')
    .positive('Sample size must be positive')
    .max(100, 'Sample size cannot exceed 100')
    .default(20)
    .describe('Number of documents to sample'),
  only_with_coordinates: z
    .string()
    .optional()
    .transform((val) => {
      if (val === undefined || val === null) return true;
      if (val === 'true' || val === '1') return true;
      if (val === 'false' || val === '0') return false;
      return true;
    })
    .pipe(z.boolean())
    .describe('Only return documents with coordinates')
});

export type DocumentSampleQuery = z.infer<typeof documentSampleQuerySchema>;

/**
 * Similar documents query parameters (GET /api/documents/[id]/similar)
 */
export const similarDocumentsQuerySchema = z.object({
  top_k: z.coerce
    .number()
    .int('top_k must be an integer')
    .positive('top_k must be positive')
    .max(100, 'top_k cannot exceed 100')
    .default(10)
    .describe('Number of similar documents to return')
});

export type SimilarDocumentsQuery = z.infer<typeof similarDocumentsQuerySchema>;

/**
 * Helper function to validate request body
 *
 * @example
 * ```ts
 * const body = await request.json();
 * const validated = validateRequestBody(extractionRequestSchema, body);
 * ```
 */
export function validateRequestBody<T extends z.ZodType>(
  schema: T,
  data: unknown
): z.infer<T> {
  const result = schema.safeParse(data);

  if (!result.success) {
    throw new ValidationError(
      'Request validation failed',
      {
        errors: result.error.format(),
        issues: result.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      }
    );
  }

  return result.data;
}

/**
 * Helper function to validate query parameters
 *
 * @example
 * ```ts
 * const { searchParams } = new URL(request.url);
 * const validated = validateQueryParams(jobIdQuerySchema, {
 *   job_id: searchParams.get('job_id')
 * });
 * ```
 */
export function validateQueryParams<T extends z.ZodType>(
  schema: T,
  params: Record<string, string | null>
): z.infer<T> {
  // Remove null values
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([_, v]) => v !== null)
  );

  const result = schema.safeParse(cleanParams);

  if (!result.success) {
    throw new ValidationError(
      'Query parameter validation failed',
      {
        errors: result.error.format(),
        issues: result.error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code
        }))
      }
    );
  }

  return result.data;
}
