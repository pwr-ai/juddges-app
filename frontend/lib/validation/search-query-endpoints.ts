/**
 * Validation schemas for search query endpoints
 *
 * These schemas validate requests to /api/search_queries endpoints
 */

import { z } from 'zod';

/**
 * Schema for creating a new search query
 * POST /api/search_queries
 */
export const createSearchQuerySchema = z.object({
  user_id: z.string().uuid('Invalid user ID format'),
  query: z.string().min(1, 'Query cannot be empty').max(10000, 'Query is too long'),
  max_documents: z.coerce.number().int().positive().max(100).default(10).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict();

/**
 * Schema for updating an existing search query
 * PUT /api/search_queries?id=<id>
 */
export const updateSearchQuerySchema = z.object({
  query: z.string().min(1, 'Query cannot be empty').max(10000, 'Query is too long').optional(),
  max_documents: z.coerce.number().int().positive().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
}).strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided for update'
  );

/**
 * Schema for query parameters with UUID
 * Used by PUT and DELETE methods
 */
export const searchQueryIdQuerySchema = z.object({
  id: z.uuid('Invalid UUID format')
});
