/**
 * Test utilities and helpers for schema editor tests
 *
 * Provides mock data, helper functions, and utilities for testing
 * the schema editor components and functionality.
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mock SchemaField type
 */
export interface MockSchemaField {
  id: string;
  schema_id?: string;
  session_id: string;
  field_path: string;
  field_name: string;
  field_type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  is_required: boolean;
  parent_field_id?: string;
  position: number;
  validation_rules: Record<string, unknown>;
  visual_metadata: {
    color?: string;
    icon?: string;
    collapsed?: boolean;
  };
  created_by: 'ai' | 'user' | 'template';
  created_at?: string;
  updated_at?: string;
}

/**
 * Mock extraction schema type
 */
export interface MockExtractionSchema {
  id: string;
  name: string;
  description?: string;
  schema_definition: Record<string, unknown>;
  schema_version: number;
  visual_metadata: Record<string, unknown>;
  last_edited_mode: 'ai' | 'visual' | 'code';
  field_count: number;
  user_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Create a mock schema field
 */
export function createMockField(
  overrides: Partial<MockSchemaField> = {}
): MockSchemaField {
  const id = overrides.id || `field-${Math.random().toString(36).substr(2, 9)}`;
  const sessionId = overrides.session_id || 'test-session-id';
  const fieldName = overrides.field_name || 'test_field';

  return {
    id,
    session_id: sessionId,
    field_path: overrides.field_path || fieldName,
    field_name: fieldName,
    field_type: overrides.field_type || 'string',
    description: overrides.description || 'Test field description',
    is_required: overrides.is_required ?? false,
    parent_field_id: overrides.parent_field_id,
    position: overrides.position ?? 0,
    validation_rules: overrides.validation_rules || {},
    visual_metadata: overrides.visual_metadata || {},
    created_by: overrides.created_by || 'user',
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create multiple mock fields
 */
export function createMockFields(count: number): MockSchemaField[] {
  return Array.from({ length: count }, (_, i) =>
    createMockField({
      field_name: `field_${i}`,
      field_path: `field_${i}`,
      position: i,
    })
  );
}

/**
 * Create mock extraction schema
 */
export function createMockSchema(
  overrides: Partial<MockExtractionSchema> = {}
): MockExtractionSchema {
  return {
    id: overrides.id || `schema-${Math.random().toString(36).substr(2, 9)}`,
    name: overrides.name || 'Test Schema',
    description: overrides.description || 'Test schema description',
    schema_definition: overrides.schema_definition || {
      type: 'object',
      properties: {},
      required: [],
    },
    schema_version: overrides.schema_version ?? 1,
    visual_metadata: overrides.visual_metadata || {},
    last_edited_mode: overrides.last_edited_mode || 'visual',
    field_count: overrides.field_count ?? 0,
    user_id: overrides.user_id || 'test-user-id',
    created_at: overrides.created_at || new Date().toISOString(),
    updated_at: overrides.updated_at || new Date().toISOString(),
  };
}

/**
 * Create a mock Supabase client for testing
 */
export function createMockSupabaseClient(): jest.Mocked<SupabaseClient> {
  const mockClient = {
    from: jest.fn(),
    auth: {
      getUser: jest.fn(),
      getSession: jest.fn(),
      signInWithPassword: jest.fn(),
      signOut: jest.fn(),
    },
    channel: jest.fn(),
    removeChannel: jest.fn(),
  } as unknown as jest.Mocked<SupabaseClient>;

  // Setup default chain for from() queries
  const mockQuery = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    like: jest.fn().mockReturnThis(),
    ilike: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    contains: jest.fn().mockReturnThis(),
    containedBy: jest.fn().mockReturnThis(),
    rangeGt: jest.fn().mockReturnThis(),
    rangeGte: jest.fn().mockReturnThis(),
    rangeLt: jest.fn().mockReturnThis(),
    rangeLte: jest.fn().mockReturnThis(),
    rangeAdjacent: jest.fn().mockReturnThis(),
    overlaps: jest.fn().mockReturnThis(),
    textSearch: jest.fn().mockReturnThis(),
    match: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    filter: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
  };

  (mockClient.from as jest.Mock).mockReturnValue(mockQuery);

  return mockClient;
}

/**
 * Create a mock Supabase channel for real-time subscriptions
 */
export function createMockChannel() {
  return {
    on: jest.fn().mockReturnThis(),
    subscribe: jest.fn().mockReturnThis(),
    unsubscribe: jest.fn().mockResolvedValue({ error: null }),
  };
}

/**
 * Mock real-time event payloads
 */
export interface MockRealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
  schema: string;
  table: string;
  commit_timestamp: string;
}

/**
 * Create a mock real-time event payload
 */
export function createMockRealtimePayload(
  eventType: 'INSERT' | 'UPDATE' | 'DELETE',
  data: Partial<MockSchemaField>
): MockRealtimePayload {
  return {
    eventType,
    new: (eventType !== 'DELETE' ? createMockField(data) : {}) as Record<string, unknown>,
    old: (eventType !== 'INSERT' ? createMockField(data) : {}) as Record<string, unknown>,
    schema: 'public',
    table: 'schema_fields',
    commit_timestamp: new Date().toISOString(),
  };
}

/**
 * Wait for a specified time (useful for debounce testing)
 */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for the next tick (useful for state updates)
 */
export function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => process.nextTick(resolve));
}

/**
 * Flush all pending promises
 */
export async function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Mock validation response from backend
 */
export interface MockValidationResponse {
  valid: boolean;
  errors: string[];
  warnings: string[];
  compiled_schema?: Record<string, unknown>;
}

/**
 * Create a mock validation response
 */
export function createMockValidationResponse(
  valid: boolean = true,
  errors: string[] = [],
  warnings: string[] = []
): MockValidationResponse {
  return {
    valid,
    errors,
    warnings,
    compiled_schema: valid
      ? {
          type: 'object',
          properties: {},
          required: [],
        }
      : undefined,
  };
}

/**
 * Mock JSON Schema for testing
 */
export function createMockJSONSchema(fields: MockSchemaField[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  fields.forEach((field) => {
    if (!field.parent_field_id) {
      properties[field.field_name] = {
        type: field.field_type,
        description: field.description,
        ...field.validation_rules,
      };

      if (field.is_required) {
        required.push(field.field_name);
      }
    }
  });

  return {
    type: 'object',
    properties,
    required,
  };
}

/**
 * Assert that an error was logged
 */
export function expectErrorLogged(
  mockLogger: { error: jest.Mock },
  message?: string
) {
  expect(mockLogger.error).toHaveBeenCalled();
  if (message) {
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining(message),
      expect.any(Object)
    );
  }
}

/**
 * Assert that info was logged
 */
export function expectInfoLogged(
  mockLogger: { info: jest.Mock },
  message?: string
) {
  expect(mockLogger.info).toHaveBeenCalled();
  if (message) {
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining(message),
      expect.any(Object)
    );
  }
}

/**
 * Create a mock fetch response
 */
export function createMockFetchResponse(
  data: unknown,
  options: { ok?: boolean; status?: number; statusText?: string } = {}
): Response {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? 'OK',
    json: jest.fn().mockResolvedValue(data),
    text: jest.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Headers(),
  } as unknown as Response;
}

/**
 * Setup mock fetch with default behavior
 */
export function setupMockFetch() {
  const mockFetch = jest.fn();
  global.fetch = mockFetch;
  return mockFetch;
}

/**
 * Cleanup mock fetch
 */
export function cleanupMockFetch() {
  delete (global as { fetch?: unknown }).fetch;
}

/**
 * Type-safe test data builder
 */
export class SchemaFieldBuilder {
  private field: Partial<MockSchemaField> = {};

  withId(id: string): this {
    this.field.id = id;
    return this;
  }

  withName(name: string): this {
    this.field.field_name = name;
    this.field.field_path = name;
    return this;
  }

  withType(type: MockSchemaField['field_type']): this {
    this.field.field_type = type;
    return this;
  }

  withDescription(description: string): this {
    this.field.description = description;
    return this;
  }

  required(): this {
    this.field.is_required = true;
    return this;
  }

  optional(): this {
    this.field.is_required = false;
    return this;
  }

  withValidation(rules: Record<string, unknown>): this {
    this.field.validation_rules = rules;
    return this;
  }

  atPosition(position: number): this {
    this.field.position = position;
    return this;
  }

  createdBy(source: 'ai' | 'user' | 'template'): this {
    this.field.created_by = source;
    return this;
  }

  withParent(parentId: string): this {
    this.field.parent_field_id = parentId;
    return this;
  }

  build(): MockSchemaField {
    return createMockField(this.field);
  }
}

/**
 * Create a schema field builder
 */
export function buildField(): SchemaFieldBuilder {
  return new SchemaFieldBuilder();
}

/**
 * Coverage target constants
 */
export const COVERAGE_TARGETS = {
  statements: 80,
  branches: 75,
  functions: 80,
  lines: 80,
} as const;

/**
 * Test timeouts
 */
export const TEST_TIMEOUTS = {
  unit: 5000,
  integration: 10000,
  e2e: 30000,
} as const;
