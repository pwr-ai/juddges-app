/**
 * Schema Service - API client for schema operations
 *
 * Provides a clean interface for interacting with schema management endpoints.
 */

import type { SchemaField, SchemaMetadata, ValidationRules, FieldType } from '@/hooks/schema-editor/types';
import type { CompiledJSONSchema } from './compiler';
import { compileSchemaFieldsToJSONSchema, validateCompiledSchema } from './compiler';
import logger from '@/lib/logger';

const serviceLogger = logger.child('schema-service');

/**
 * Schema save request payload
 */
export interface SchemaSaveRequest {
  name: string;
  description?: string;
  category: string;
  type: string;
  text: string; // JSON stringified schema
  status?: string; // 'published' when saving to DB
  is_verified?: boolean; // Verification status
  dates?: {
    created_at?: string;
    updated_at?: string;
  };
}

/**
 * Schema save response
 */
export interface SchemaSaveResponse {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  type: string;
  text: string;
  dates: Record<string, unknown>;
  status?: string;
  is_verified?: boolean;
  userId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Validation result from backend
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Complete save result with metadata
 */
export interface SaveResult {
  success: boolean;
  schemaId?: string;
  schema?: SchemaSaveResponse; // Include full schema response to get updated status
  errors: string[];
  warnings: string[];
}

/**
 * Schema Service Class
 *
 * Handles all schema-related API operations including compilation,
 * validation, and persistence.
 */
export class SchemaService {
  private baseUrl: string;

  constructor(baseUrl = '/api/schemas') {
    this.baseUrl = baseUrl;
  }

  /**
   * Compile and validate fields before saving
   *
   * @param fields - Array of schema fields
   * @param metadata - Schema metadata
   * @returns Compilation and validation result
   */
  async prepareSchema(
    fields: SchemaField[],
    metadata: SchemaMetadata
  ): Promise<{
    success: boolean;
    compiledSchema?: CompiledJSONSchema;
    errors: string[];
    warnings: string[];
  }> {
    serviceLogger.debug('Preparing schema for save', {
      fieldCount: fields.length,
      metadata,
    });

    // Step 1: Compile fields to JSON Schema
    const compilationResult = compileSchemaFieldsToJSONSchema(fields, metadata);

    if (!compilationResult.success || !compilationResult.schema) {
      serviceLogger.error('Schema compilation failed', {
        errors: compilationResult.errors,
      });
      return {
        success: false,
        errors: compilationResult.errors,
        warnings: compilationResult.warnings,
      };
    }

    // Step 2: Validate compiled schema structure
    const structuralErrors = validateCompiledSchema(compilationResult.schema);
    if (structuralErrors.length > 0) {
      serviceLogger.error('Schema structural validation failed', {
        errors: structuralErrors,
      });
      return {
        success: false,
        compiledSchema: compilationResult.schema,
        errors: structuralErrors,
        warnings: compilationResult.warnings,
      };
    }

    serviceLogger.info('Schema preparation successful', {
      fieldCount: compilationResult.fieldCount,
      requiredCount: compilationResult.requiredFieldCount,
    });

    return {
      success: true,
      compiledSchema: compilationResult.schema,
      errors: [],
      warnings: compilationResult.warnings,
    };
  }

  /**
   * Extract error message from error response
   * Handles ErrorDetail format, error field, or HTTP status
   */
  private extractErrorMessage(errorData: any, response: Response): string {
    return errorData.message || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
  }

  /**
   * Transform API response to match SchemaSaveResponse interface
   * Handles snake_case to camelCase conversion
   */
  private transformSchemaResponse(rawSchema: any): SchemaSaveResponse {
      return {
      id: rawSchema.id,
      name: rawSchema.name,
      description: rawSchema.description,
      category: rawSchema.category,
      type: rawSchema.type,
      text: typeof rawSchema.text === 'string' ? rawSchema.text : JSON.stringify(rawSchema.text || {}),
      dates: rawSchema.dates || {},
      status: rawSchema.status || 'published',
      is_verified: rawSchema.is_verified || false,
      userId: rawSchema.user_id || rawSchema.userId || null,
      createdAt: rawSchema.created_at || rawSchema.createdAt || new Date().toISOString(),
      updatedAt: rawSchema.updated_at || rawSchema.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Create a new schema
   *
   * @param fields - Array of schema fields
   * @param metadata - Schema metadata
   * @returns Save result with schema ID
   */
  async createSchema(
    fields: SchemaField[],
    metadata: SchemaMetadata
  ): Promise<SaveResult> {
    serviceLogger.info('Creating new schema', {
      name: metadata.name,
      fieldCount: fields.length,
    });

    // Prepare schema
    const prepResult = await this.prepareSchema(fields, metadata);
    if (!prepResult.success || !prepResult.compiledSchema) {
      return {
        success: false,
        errors: prepResult.errors,
        warnings: prepResult.warnings,
      };
    }

    // Build request payload
    // For new schemas, default to 'draft' status unless explicitly set in metadata
    const now = new Date().toISOString();
    const payload: SchemaSaveRequest = {
      name: metadata.name || 'Untitled Schema',
      description: metadata.description || undefined,
      category: 'extraction', // Default category
      type: 'json_schema', // Schema type
      text: JSON.stringify(prepResult.compiledSchema, null, 2),
      status: (metadata as any).status || 'draft', // New schemas start as draft by default
      is_verified: (metadata as any).is_verified || false,
      dates: {
        created_at: now,
        updated_at: now,
      },
    };

    try {
      // Send POST request
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = this.extractErrorMessage(errorData, response);

        serviceLogger.error('Schema creation failed', {
          status: response.status,
          error: errorMessage,
          errorData,
        });

        return {
          success: false,
          errors: [errorMessage],
          warnings: prepResult.warnings,
        };
      }

      const rawSchema: any = await response.json();
      const savedSchema = this.transformSchemaResponse(rawSchema);

      serviceLogger.info('Schema created successfully', {
        schemaId: savedSchema.id,
        name: savedSchema.name,
      });

      return {
        success: true,
        schemaId: savedSchema.id,
        schema: savedSchema, // Include full schema response
        errors: [],
        warnings: prepResult.warnings,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Network error during save';

      serviceLogger.error('Schema creation request failed', error);

      return {
        success: false,
        errors: [errorMessage],
        warnings: prepResult.warnings,
      };
    }
  }

  /**
   * Update an existing schema
   *
   * @param schemaId - ID of schema to update
   * @param fields - Array of schema fields
   * @param metadata - Schema metadata
   * @returns Save result
   */
  async updateSchema(
    schemaId: string,
    fields: SchemaField[],
    metadata: SchemaMetadata
  ): Promise<SaveResult> {
    serviceLogger.info('Updating schema', {
      schemaId,
      name: metadata.name,
      fieldCount: fields.length,
    });

    // Prepare schema
    const prepResult = await this.prepareSchema(fields, metadata);
    if (!prepResult.success || !prepResult.compiledSchema) {
      return {
        success: false,
        errors: prepResult.errors,
        warnings: prepResult.warnings,
      };
    }

    // Build request payload
    // Note: status is not included here - it's managed separately via updateSchemaStatus
    // This prevents accidentally overwriting user's status choice when saving schema content
    const payload: Partial<SchemaSaveRequest> = {
      name: metadata.name || 'Untitled Schema',
      description: metadata.description || undefined,
      text: JSON.stringify(prepResult.compiledSchema, null, 2),
      is_verified: (metadata as any).is_verified,
      dates: {
        updated_at: new Date().toISOString(),
      },
    };

    try {
      // Send PUT request
      const response = await fetch(`${this.baseUrl}?id=${schemaId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = this.extractErrorMessage(errorData, response);

        serviceLogger.error('Schema update failed', {
          schemaId,
          status: response.status,
          error: errorMessage,
          errorData,
        });

        return {
          success: false,
          errors: [errorMessage],
          warnings: prepResult.warnings,
        };
      }

      const rawSchema: any = await response.json();
      const updatedSchema = this.transformSchemaResponse(rawSchema);

      serviceLogger.info('Schema updated successfully', {
        schemaId: updatedSchema.id,
        name: updatedSchema.name,
      });

      return {
        success: true,
        schemaId: updatedSchema.id,
        schema: updatedSchema, // Include full schema response
        errors: [],
        warnings: prepResult.warnings,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Network error during update';

      serviceLogger.error('Schema update request failed', error);

      return {
        success: false,
        errors: [errorMessage],
        warnings: prepResult.warnings,
      };
    }
  }

  /**
   * Save schema (create or update based on schemaId)
   *
   * @param schemaId - ID of schema to update (null for new schema)
   * @param fields - Array of schema fields
   * @param metadata - Schema metadata
   * @returns Save result with schema ID
   */
  async saveSchema(
    schemaId: string | null,
    fields: SchemaField[],
    metadata: SchemaMetadata
  ): Promise<SaveResult> {
    if (schemaId) {
      return this.updateSchema(schemaId, fields, metadata);
    } else {
      return this.createSchema(fields, metadata);
    }
  }

  /**
   * Update only the verification status of a schema
   *
   * @param schemaId - ID of schema to update
   * @param isVerified - New verification status
   * @returns Update result
   */
  async updateSchemaVerification(
    schemaId: string,
    isVerified: boolean
  ): Promise<{ success: boolean; error?: string }> {
    serviceLogger.info('Updating schema verification', {
      schemaId,
      isVerified,
    });

    try {
      const response = await fetch(`${this.baseUrl}?id=${schemaId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ is_verified: isVerified }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = this.extractErrorMessage(errorData, response);

        serviceLogger.error('Schema verification update failed', {
          schemaId,
          status: response.status,
          error: errorMessage,
        });

        return {
          success: false,
          error: errorMessage,
        };
      }

      serviceLogger.info('Schema verification updated successfully', {
        schemaId,
        isVerified,
      });

      return {
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Network error during update';

      serviceLogger.error('Schema verification update request failed', error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Update only the status of a schema
   * Only schema owners can change the status
   *
   * @param schemaId - ID of schema to update
   * @param status - New status value (draft, published, review, archived)
   * @returns Update result with updated schema data
   */
  async updateSchemaStatus(
    schemaId: string,
    status: 'draft' | 'published' | 'review' | 'archived'
  ): Promise<{ success: boolean; schema?: SchemaSaveResponse; error?: string }> {
    serviceLogger.info('Updating schema status', {
      schemaId,
      status,
    });

    try {
      const response = await fetch(`${this.baseUrl}?id=${schemaId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = this.extractErrorMessage(errorData, response);

        serviceLogger.error('Schema status update failed', {
          schemaId,
          status: response.status,
          error: errorMessage,
        });

        return {
          success: false,
          error: errorMessage,
        };
      }

      const rawSchema = await response.json();
      const updatedSchema = this.transformSchemaResponse(rawSchema);

      serviceLogger.info('Schema status updated successfully', {
        schemaId,
        status,
      });

      return {
        success: true,
        schema: updatedSchema,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Network error during update';

      serviceLogger.error('Schema status update request failed', error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Update schema metadata (name and/or description)
   * Only schema owners can update metadata
   *
   * @param schemaId - ID of schema to update
   * @param updates - Object containing name and/or description to update
   * @returns Update result with updated schema data
   */
  async updateSchemaMetadata(
    schemaId: string,
    updates: { name?: string; description?: string }
  ): Promise<{ success: boolean; schema?: SchemaSaveResponse; error?: string }> {
    serviceLogger.info('Updating schema metadata', {
      schemaId,
      updates,
    });

    // Build payload with only provided fields
    const payload: Record<string, string | undefined> = {};
    if (updates.name !== undefined) payload.name = updates.name;
    if (updates.description !== undefined) payload.description = updates.description;

    if (Object.keys(payload).length === 0) {
      return {
        success: false,
        error: 'No updates provided',
      };
    }

    try {
      const response = await fetch(`${this.baseUrl}?id=${schemaId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = this.extractErrorMessage(errorData, response);

        serviceLogger.error('Schema metadata update failed', {
          schemaId,
          status: response.status,
          error: errorMessage,
        });

        return {
          success: false,
          error: errorMessage,
        };
      }

      const rawSchema = await response.json();
      const updatedSchema = this.transformSchemaResponse(rawSchema);

      serviceLogger.info('Schema metadata updated successfully', {
        schemaId,
        name: updatedSchema.name,
      });

      return {
        success: true,
        schema: updatedSchema,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Network error during update';

      serviceLogger.error('Schema metadata update request failed', error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * List schemas with pagination
   *
   * @param page - Page number (1-based)
   * @param pageSize - Number of schemas per page
   * @returns Paginated list of schemas with pagination metadata
   */
  async listSchemasPaginated(
    page: number = 1,
    pageSize: number = 100
  ): Promise<{
    success: boolean;
    schemas?: SchemaSaveResponse[];
    pagination?: {
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      has_next: boolean;
      has_prev: boolean;
    };
    error?: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}?page=${page}&pageSize=${pageSize}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = this.extractErrorMessage(errorData, response);

        serviceLogger.error('Schema paginated list fetch failed', {
          status: response.status,
          error: errorMessage,
        });

        return {
          success: false,
          error: errorMessage,
        };
      }

      const responseData = await response.json();

      // Handle paginated response
      const rawSchemas: any[] = Array.isArray(responseData)
        ? responseData
        : (responseData.data || []);

      // Transform API response to match SchemaSaveResponse interface
      const schemas: SchemaSaveResponse[] = rawSchemas.map((schema: any) =>
        this.transformSchemaResponse(schema)
      );

      const pagination = responseData.pagination ? {
        total: responseData.pagination.total,
        page: responseData.pagination.page,
        pageSize: responseData.pagination.pageSize || responseData.pagination.page_size,
        totalPages: responseData.pagination.totalPages || responseData.pagination.total_pages,
        has_next: responseData.pagination.has_next || false,
        has_prev: responseData.pagination.has_prev || false,
      } : undefined;

      serviceLogger.info('Schemas fetched successfully (paginated)', {
        count: schemas.length,
        page,
        pageSize,
      });

      return {
        success: true,
        schemas,
        pagination,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Network error during fetch';

      serviceLogger.error('Schema paginated list fetch exception', error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * List all schemas for the current user
   * Calls listSchemasPaginated internally to avoid code duplication
   *
   * @returns List of all saved schemas
   */
  async listSchemas(): Promise<{
    success: boolean;
    schemas?: SchemaSaveResponse[];
    error?: string;
  }> {
    // Use paginated method with large page size to get all schemas
    const result = await this.listSchemasPaginated(1, 100);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      schemas: result.schemas,
    };
  }

  /**
   * Load a schema by ID and parse it into fields
   *
   * @param schemaId - ID of schema to load
   * @returns Loaded schema with parsed fields
   */
  async loadSchema(schemaId: string): Promise<{
    success: boolean;
    schema?: SchemaSaveResponse;
    fields?: SchemaField[];
    error?: string;
  }> {
    try {
      // Fetch all schemas and find the one we need
      const listResult = await this.listSchemas();

      if (!listResult.success || !listResult.schemas) {
        return {
          success: false,
          error: listResult.error || 'Failed to fetch schemas',
        };
      }

      const schema = listResult.schemas.find((s) => s.id === schemaId);

      if (!schema) {
        serviceLogger.error('Schema not found', { schemaId });
        return {
          success: false,
          error: `Schema with ID ${schemaId} not found`,
        };
      }

      // Parse the JSON Schema text into fields
      // Handle both string and object formats
      let jsonSchema: CompiledJSONSchema;
      try {
        if (typeof schema.text === 'string') {
          jsonSchema = JSON.parse(schema.text);
        } else if (typeof schema.text === 'object' && schema.text !== null) {
          jsonSchema = schema.text as CompiledJSONSchema;
        } else {
          serviceLogger.error('Schema text is invalid', { schemaId, textType: typeof schema.text });
          return {
            success: false,
            error: 'Schema text is invalid or empty',
          };
        }
      } catch (parseError) {
        serviceLogger.error('Failed to parse schema JSON', parseError, {
          schemaId,
          textType: typeof schema.text,
        });
        return {
          success: false,
          error: 'Schema contains invalid JSON',
        };
      }

      // Convert JSON Schema properties to SchemaField array
      const fields = this.parseJsonSchemaToFields(jsonSchema);

      serviceLogger.info('Schema loaded successfully', {
        schemaId,
        fieldCount: fields.length,
      });

      return {
        success: true,
        schema,
        fields,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load schema';

      serviceLogger.error('Schema load exception', error);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Parse JSON Schema properties into SchemaField array
   *
   * @param jsonSchema - Compiled JSON Schema
   * @param parentId - Parent field ID for nested structures
   * @param parentPath - Parent path for building field paths
   * @param existingFieldNames - Set of existing field names to preserve created_by
   * @returns Array of SchemaField objects
   */
  parseJsonSchemaToFields(
    jsonSchema: CompiledJSONSchema,
    parentId: string | null = null,
    parentPath = 'root',
    existingFieldNames: Set<string> = new Set()
  ): SchemaField[] {
    const fields: SchemaField[] = [];
    const properties = jsonSchema.properties || {};
    const required = Array.isArray(jsonSchema.required) ? jsonSchema.required : [];

    let position = 0;

    for (const [fieldName, property] of Object.entries(properties)) {
      const fieldId = `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const fieldPath = `${parentPath}.${fieldName}`;

      // Determine created_by based on x-ai-generated marker or existing fields
      // Priority: x-ai-generated marker > existing field check > default 'user'
      const isAiGenerated = (property as any)['x-ai-generated'] === true;
      const isExistingField = existingFieldNames.has(fieldName);
      const createdBy = isAiGenerated ? 'ai' : (isExistingField ? 'existing' : 'user');

      // Create base field
      const field: SchemaField = {
        id: fieldId,
        session_id: '', // Will be set by store
        field_path: fieldPath,
        field_name: fieldName,
        field_type: property.type as FieldType,
        description: property.description,
        is_required: required.includes(fieldName),
        parent_field_id: parentId,
        position: position++,
        validation_rules: this.extractValidationRules(property),
        visual_metadata: isAiGenerated ? { needsReview: true } : {},
        created_by: createdBy as 'ai' | 'user' | 'template' | 'existing',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      fields.push(field);

      // Handle nested objects
      if (property.type === 'object' && property.properties) {
        const propertyRequired = (property as any).required;
        const nestedSchema: CompiledJSONSchema = {
          type: 'object',
          properties: property.properties,
          required: Array.isArray(propertyRequired) ? propertyRequired : [],
          additionalProperties: false,
        };
        const nestedFields = this.parseJsonSchemaToFields(
          nestedSchema,
          fieldId,
          fieldPath,
          existingFieldNames
        );
        fields.push(...nestedFields);
      }

      // Handle arrays with item schema
      if (property.type === 'array' && property.items) {
        const itemId = `field-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const itemIsAiGenerated = (property.items as any)['x-ai-generated'] === true;
        const itemField: SchemaField = {
          id: itemId,
          session_id: '',
          field_path: `${fieldPath}[]`,
          field_name: 'items',
          field_type: (property.items as any).type as FieldType,
          description: (property.items as any).description,
          is_required: false,
          parent_field_id: fieldId,
          position: 0,
          validation_rules: this.extractValidationRules(property.items as any),
          visual_metadata: itemIsAiGenerated ? { needsReview: true } : {},
          created_by: itemIsAiGenerated ? 'ai' : 'user',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        fields.push(itemField);
      }
    }

    return fields;
  }

  /**
   * Extract validation rules from JSON Schema property
   *
   * @param property - JSON Schema property
   * @returns Validation rules object
   */
  private extractValidationRules(property: any): ValidationRules {
    const rules: ValidationRules = {};

    // String validations
    if (property.pattern) rules.pattern = property.pattern;
    if (property.minLength !== undefined) rules.minLength = property.minLength;
    if (property.maxLength !== undefined) rules.maxLength = property.maxLength;

    // Number validations
    if (property.minimum !== undefined) rules.minimum = property.minimum;
    if (property.maximum !== undefined) rules.maximum = property.maximum;
    if (property.exclusiveMinimum !== undefined)
      rules.exclusiveMinimum = property.exclusiveMinimum;
    if (property.exclusiveMaximum !== undefined)
      rules.exclusiveMaximum = property.exclusiveMaximum;
    if (property.multipleOf !== undefined) rules.multipleOf = property.multipleOf;

    // Array validations
    if (property.minItems !== undefined) rules.minItems = property.minItems;
    if (property.maxItems !== undefined) rules.maxItems = property.maxItems;
    if (property.uniqueItems !== undefined)
      rules.uniqueItems = property.uniqueItems;

    // Object validations
    if (property.minProperties !== undefined)
      rules.minProperties = property.minProperties;
    if (property.maxProperties !== undefined)
      rules.maxProperties = property.maxProperties;

    // Enum validation
    if (property.enum && Array.isArray(property.enum)) rules.enum = property.enum;

    return rules;
  }
}

/**
 * Default schema service instance
 */
export const schemaService = new SchemaService();
