/**
 * Validation schemas for schema management endpoints.
 */

import { z } from 'zod';
import { uuidSchema } from './base';

/**
 * Schema creation validation
 */
export const createSchemaRequestSchema = z.object({
  name: z.string()
    .min(1, 'Schema name is required')
    .max(255, 'Schema name must be 255 characters or less')
    .trim(),
  description: z.string()
    .max(5000, 'Description is too long')
    .trim()
    .optional(),
  type: z.string()
    .min(1, 'Schema type is required')
    .trim(),
  category: z.string()
    .min(1, 'Schema category is required')
    .trim(),
  text: z.string()
    .min(1, 'Schema text is required')
    .refine(
      (str) => {
        try {
          JSON.parse(str);
          return true;
        } catch {
          return false;
        }
      },
      'Schema text must be valid JSON'
    ),
  dates: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['draft', 'published']).optional(),
  is_verified: z.boolean().optional()
}).strict();

export type CreateSchemaRequest = z.infer<typeof createSchemaRequestSchema>;

/**
 * Schema update validation
 */
export const updateSchemaRequestSchema = z.object({
  name: z.string().min(1).max(255).trim().optional(),
  description: z.string().max(5000).trim().optional(),
  type: z.string().min(1).trim().optional(),
  category: z.string().min(1).trim().optional(),
  text: z.string()
    .min(1)
    .refine(
      (str) => {
        try {
          JSON.parse(str);
          return true;
        } catch {
          return false;
        }
      },
      'Schema text must be valid JSON'
    )
    .optional(),
  dates: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['draft', 'published']).optional(),
  is_verified: z.boolean().optional()
}).strict();

export type UpdateSchemaRequest = z.infer<typeof updateSchemaRequestSchema>;

/**
 * Schema ID query parameter
 */
export const schemaIdQuerySchema = z.object({
  id: uuidSchema
}).strict();

export type SchemaIdQuery = z.infer<typeof schemaIdQuerySchema>;
