/**
 * Validation schemas for chat endpoints.
 */

import { z } from 'zod';

/**
 * Chat history message schema
 */
export const chatMessageSchema = z.object({
  role: z.enum(['human', 'ai', 'user', 'assistant', 'system']),
  content: z.string().min(1, 'Message content cannot be empty')
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

/**
 * Chat request validation
 */
export const chatRequestSchema = z.object({
  question: z.string()
    .min(1, 'Question is required')
    .max(10000, 'Question is too long (max 10,000 characters)'),
  max_documents: z.coerce.number()
    .int()
    .positive()
    .max(100)
    .default(10)
    .optional(),
  score_threshold: z.coerce.number()
    .min(0, 'Score threshold must be between 0 and 1')
    .max(1, 'Score threshold must be between 0 and 1')
    .default(0)
    .optional(),
  chat_history: z.array(chatMessageSchema)
    .max(50, 'Chat history too long (max 50 messages)')
    .default([])
    .optional(),
  response_format: z.enum(['detailed', 'concise', 'structured', 'short', 'adaptive'])
    .default('detailed')
    .optional()
}).strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

/**
 * Search query request validation
 */
export const searchQueryRequestSchema = z.object({
  query: z.string()
    .min(1, 'Search query is required')
    .max(1000, 'Query is too long'),
  collection_id: z.string().uuid('Invalid UUID format').optional(),
  limit: z.coerce.number().int().positive().max(100).default(10).optional(),
  offset: z.coerce.number().int().nonnegative().default(0).optional()
}).strict();

export type SearchQueryRequest = z.infer<typeof searchQueryRequestSchema>;

/**
 * Query enhancement request
 */
export const enhanceQueryRequestSchema = z.object({
  query: z.string()
    .min(1, 'Query is required')
    .max(1000, 'Query is too long'),
  context: z.string().max(5000).optional(),
  language: z.enum(['pl', 'en', 'uk']).default('pl').optional()
}).strict();

export type EnhanceQueryRequest = z.infer<typeof enhanceQueryRequestSchema>;
