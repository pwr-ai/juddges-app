import { useMemo } from "react";

import { compileSchemaFieldsToJSONSchema } from "@/lib/schema-editor/compiler";
import type { SchemaField } from "@/hooks/schema-editor/types";

function formatFieldName(fieldName: string): string {
  return fieldName
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildPlaceholder(
  fieldName: string,
  fieldDef: Record<string, unknown>
): unknown {
  const fieldType = fieldDef.type || "string";
  const fieldNameLower = fieldName.toLowerCase();

  if (fieldDef.format === "date") {
    return "2024-01-15";
  }

  if (fieldDef.format === "date-time" || fieldDef.format === "datetime") {
    return "2024-01-15T10:00:00Z";
  }

  if (fieldDef.format === "email" || fieldType === "email") {
    return "example@domain.com";
  }

  if (fieldDef.format === "uri" || fieldDef.format === "url" || fieldType === "url") {
    return "https://example.com";
  }

  if (Array.isArray(fieldDef.enum) && fieldDef.enum.length > 0) {
    return fieldDef.enum[0];
  }

  if (fieldType === "string") {
    if (fieldDef.default !== undefined && fieldDef.default !== null) {
      return fieldDef.default;
    }

    if (fieldNameLower.includes("name") || fieldNameLower.includes("nazwa")) {
      return "John Doe";
    }

    if (fieldNameLower.includes("email") || fieldNameLower.includes("mail")) {
      return "example@email.com";
    }

    if (fieldNameLower.includes("phone") || fieldNameLower.includes("telefon")) {
      return "+48 123 456 789";
    }

    if (fieldNameLower.includes("address") || fieldNameLower.includes("adres")) {
      return "123 Main Street, Warsaw";
    }

    if (fieldNameLower.includes("question") || fieldNameLower.includes("pytanie")) {
      return "What is the tax rate for this transaction? ";
    }

    if (fieldNameLower.includes("answer") || fieldNameLower.includes("odpowiedz")) {
      return "The tax rate is 23% according to current regulations.";
    }

    if (fieldNameLower.includes("description") || fieldNameLower.includes("opis")) {
      return "Detailed description of the field content";
    }

    if (fieldNameLower.includes("note") || fieldNameLower.includes("uwaga")) {
      return "Additional notes or comments";
    }

    if (fieldNameLower.includes("comment") || fieldNameLower.includes("komentarz")) {
      return "User comment or remark";
    }

    if (fieldNameLower.includes("title") || fieldNameLower.includes("tytul")) {
      return "Document Title";
    }

    if (fieldNameLower.includes("number") || fieldNameLower.includes("numer")) {
      return "12345";
    }

    if (fieldNameLower.includes("code") || fieldNameLower.includes("kod")) {
      return "ABC123";
    }

    if (fieldNameLower.includes("id") || fieldNameLower.includes("identyfikator")) {
      return "ID-2024-001";
    }

    if (fieldNameLower.includes("status")) {
      return "Active";
    }

    if (fieldNameLower.includes("type")) {
      return "Standard";
    }

    return "Example text value";
  }

  if (fieldType === "number" || fieldType === "integer") {
    return fieldDef.default !== undefined && fieldDef.default !== null
      ? fieldDef.default
      : 123;
  }

  if (fieldType === "boolean") {
    return fieldDef.default !== undefined && fieldDef.default !== null
      ? fieldDef.default
      : true;
  }

  if (fieldType === "array") {
    const items =
      typeof fieldDef.items === "object" && fieldDef.items !== null
        ? (fieldDef.items as Record<string, unknown>)
        : null;
    if (items) {
      const itemProperties =
        typeof items.properties === "object" && items.properties !== null
          ? (items.properties as Record<string, unknown>)
          : null;

      if (items.type === "object" && itemProperties) {
        const sampleItem: Record<string, unknown> = {};
        Object.entries(itemProperties).forEach(([nestedName, nestedDef]) => {
          sampleItem[nestedName] = buildPlaceholder(
            nestedName,
            nestedDef as Record<string, unknown>
          );
        });
        return [sampleItem];
      }

      if (items.type === "string") {
        return ["Item 1", "Item 2", "Item 3"];
      }

      if (items.type === "number") {
        return [1, 2, 3];
      }
    }

    return ["Sample Item 1", "Sample Item 2"];
  }

  if (fieldType === "object") {
    const properties =
      typeof fieldDef.properties === "object" && fieldDef.properties !== null
        ? (fieldDef.properties as Record<string, unknown>)
        : null;
    if (properties) {
      const nestedObject: Record<string, unknown> = {};
      Object.entries(properties).forEach(([nestedName, nestedDef]) => {
        nestedObject[nestedName] = buildPlaceholder(
          nestedName,
          nestedDef as Record<string, unknown>
        );
      });
      return nestedObject;
    }

    return { sample: "value" };
  }

  return `Sample ${formatFieldName(fieldName)}`;
}

export function buildSchemaPreviewData(
  fields: SchemaField[],
  schemaName: string,
  schemaDescription?: string
): Record<string, unknown> {
  if (fields.length === 0) {
    return {};
  }

  const schema = compileSchemaFieldsToJSONSchema(fields, {
    name: schemaName,
    description: schemaDescription,
  });

  if (!schema) {
    return {};
  }
  const placeholderData: Record<string, unknown> = {};

  if (schema.properties) {
    Object.entries(schema.properties).forEach(([fieldName, fieldDef]) => {
      placeholderData[fieldName] = buildPlaceholder(
        fieldName,
        (fieldDef as unknown as Record<string, unknown>) || {}
      );
    });
  }

  return placeholderData;
}

export function useSchemaPreviewData(
  fields: SchemaField[],
  schemaName: string,
  schemaDescription?: string
): Record<string, unknown> {
  return useMemo(
    () => buildSchemaPreviewData(fields, schemaName, schemaDescription),
    [fields, schemaDescription, schemaName]
  );
}
