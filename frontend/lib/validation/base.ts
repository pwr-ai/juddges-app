/**
 * Base validation schemas shared across the application.
 *
 * This file contains primitive validators that are used by other validation modules.
 * IMPORTANT: This file must NOT import from other validation files to avoid circular dependencies.
 */

import { z } from 'zod';

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Language enum
 */
export const languageSchema = z.enum(['pl', 'en', 'uk']).default('pl');
