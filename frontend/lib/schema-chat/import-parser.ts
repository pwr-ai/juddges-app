import type { SchemaField, ValidationRules } from "@/hooks/schema-editor/types";

interface ParsedImportSchema {
  name: string;
  description?: string;
  fields: SchemaField[];
}

interface JsonSchemaProperty {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  enum?: Array<string | number | boolean>;
}

interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  additionalProperties?: boolean;
}

interface ImportEnvelope {
  name?: string;
  description?: string;
  type?: string;
  required?: string[];
  additionalProperties?: boolean;
  properties?: Record<string, JsonSchemaProperty>;
  schema?: {
    properties?: Record<string, JsonSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean;
  };
}

function createFieldId(): string {
  return `field-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPropertyMap(value: unknown): value is Record<string, JsonSchemaProperty> {
  return isRecord(value) && Object.values(value).every((entry) => isRecord(entry));
}

function normalizeFieldType(type?: JsonSchemaProperty["type"]): SchemaField["field_type"] {
  if (type === "number" || type === "integer") {
    return "number";
  }

  if (type === "boolean" || type === "array" || type === "object") {
    return type;
  }

  return "string";
}

function extractValidationRules(property: JsonSchemaProperty): ValidationRules {
  const validationRules: ValidationRules = {};

  if (property.pattern) {
    validationRules.pattern = property.pattern;
  }
  if (property.minLength !== undefined) {
    validationRules.minLength = property.minLength;
  }
  if (property.maxLength !== undefined) {
    validationRules.maxLength = property.maxLength;
  }
  if (property.minimum !== undefined) {
    validationRules.minimum = property.minimum;
  }
  if (property.maximum !== undefined) {
    validationRules.maximum = property.maximum;
  }
  if (property.enum) {
    validationRules.enum = property.enum;
  }

  return validationRules;
}

function parseJsonSchemaToFields(
  schema: JsonSchemaObject,
  parentId: string | null = null,
  parentPath = "root"
): SchemaField[] {
  const fields: SchemaField[] = [];
  const properties = schema.properties;
  const required = schema.required;
  const timestamp = new Date().toISOString();

  let position = 0;

  Object.entries(properties).forEach(([fieldName, property]) => {
    const fieldId = createFieldId();
    const fieldPath = `${parentPath}.${fieldName}`;

    const field: SchemaField = {
      id: fieldId,
      session_id: "",
      field_path: fieldPath,
      field_name: fieldName,
      field_type: normalizeFieldType(property.type),
      description: property.description,
      is_required: required.includes(fieldName),
      parent_field_id: parentId,
      position: position++,
      validation_rules: extractValidationRules(property),
      visual_metadata: {},
      created_by: "user",
      created_at: timestamp,
      updated_at: timestamp,
    };

    fields.push(field);

    if (property.type === "object" && property.properties) {
      const nestedSchema: JsonSchemaObject = {
        type: "object",
        properties: property.properties,
        required: Array.isArray(property.required) ? property.required : [],
        additionalProperties: false,
      };
      fields.push(...parseJsonSchemaToFields(nestedSchema, fieldId, fieldPath));
    }

    if (property.type === "array" && property.items) {
      fields.push({
        id: createFieldId(),
        session_id: "",
        field_path: `${fieldPath}[]`,
        field_name: "items",
        field_type: normalizeFieldType(property.items.type),
        description: property.items.description,
        is_required: false,
        parent_field_id: fieldId,
        position: 0,
        validation_rules: {},
        visual_metadata: {},
        created_by: "user",
        created_at: timestamp,
        updated_at: timestamp,
      });
    }
  });

  return fields;
}

function normalizeImportedJsonSchema(parsed: ImportEnvelope): JsonSchemaObject {
  if (parsed.properties) {
    return {
      type: "object",
      properties: parsed.properties,
      required: Array.isArray(parsed.required) ? parsed.required : [],
      additionalProperties: parsed.additionalProperties ?? false,
    };
  }

  if (parsed.schema?.properties) {
    return {
      type: "object",
      properties: parsed.schema.properties,
      required: Array.isArray(parsed.schema.required) ? parsed.schema.required : [],
      additionalProperties: parsed.schema.additionalProperties ?? false,
    };
  }

  if (!parsed.type && isPropertyMap(parsed)) {
    return {
      type: "object",
      properties: parsed,
      required: [],
      additionalProperties: false,
    };
  }

  throw new Error(
    "Invalid schema format. Expected JSON Schema with properties or a properties object."
  );
}

export function parseImportTextToSchema(importText: string): ParsedImportSchema {
  const parsedJson = JSON.parse(importText) as unknown;
  if (!isRecord(parsedJson)) {
    throw new Error(
      "Invalid schema format. Expected JSON Schema with properties or a properties object."
    );
  }

  const parsed = parsedJson as ImportEnvelope;
  const normalizedSchema = normalizeImportedJsonSchema(parsed);
  const fields = parseJsonSchemaToFields(normalizedSchema);

  if (fields.length === 0) {
    throw new Error("No fields found in schema. Please check the JSON format.");
  }

  return {
    name: typeof parsed.name === "string" ? parsed.name : "Imported Schema",
    description: typeof parsed.description === "string" ? parsed.description : undefined,
    fields,
  };
}
