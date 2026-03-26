"use client";

import React from 'react';
import { ExtractionSchema } from '@/types/extraction_schemas';
import { ExtractionDataViewer } from '@/lib/styles/components/extraction/ExtractionDataViewer';
import { parseSchemaText } from '@/lib/schema-utils';
import { BaseCard } from '@/lib/styles/components';

interface SchemaPreviewProps {
 schema: ExtractionSchema;
}

/**
 * Generate placeholder data from schema fields
 */
function generatePlaceholderData(schema: ExtractionSchema): Record<string, any> {
 const parsedSchema = parseSchemaText(schema.text);
 if (!parsedSchema) return {};

 const placeholderData: Record<string, any> = {};
 const schemaFields = (parsedSchema.properties as Record<string, any>) || parsedSchema;

 const generatePlaceholder = (fieldName: string, fieldDef: any): any => {
 if (!fieldDef || typeof fieldDef !== 'object') return null;

 const fieldType = fieldDef.type || 'string';
 const fieldNameFormatted = fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

 // Check if it's a date field
 if (fieldDef.format === 'date' || (fieldDef.type === 'string' && fieldDef.format === 'date')) {
 return '2024-01-15';
 }

 // Check if it's a datetime field
 if (fieldDef.format === 'date-time' || fieldDef.format === 'datetime') {
 return '2024-01-15T10:00:00Z';
 }

 // Check if it's an email field
 if (fieldDef.format === 'email' || fieldType === 'email') {
 return 'example@domain.com';
 }

 // Check if it's a URL field
 if (fieldDef.format === 'uri' || fieldDef.format === 'url' || fieldType === 'url') {
 return 'https://example.com';
 }

 switch (fieldType) {
 case 'string':
 // Use example if available
 if (fieldDef.example !== undefined && fieldDef.example !== null) {
 return fieldDef.example;
 }
 // Use default if available
 if (fieldDef.default !== undefined && fieldDef.default !== null) {
 return fieldDef.default;
 }
 // Generate based on field name
 if (fieldName.toLowerCase().includes('name')) {
 return 'Sample Name';
 }
 if (fieldName.toLowerCase().includes('description') || fieldName.toLowerCase().includes('description')) {
 return 'Sample description text';
 }
 if (fieldName.toLowerCase().includes('status')) {
 return 'Active';
 }
 if (fieldName.toLowerCase().includes('type')) {
 return 'Sample Type';
 }
 return `Sample ${fieldNameFormatted}`;

 case 'number':
 case 'integer':
 if (fieldDef.example !== undefined && fieldDef.example !== null) {
 return fieldDef.example;
 }
 if (fieldDef.default !== undefined && fieldDef.default !== null) {
 return fieldDef.default;
 }
 return 123;

 case 'boolean':
 if (fieldDef.default !== undefined && fieldDef.default !== null) {
 return fieldDef.default;
 }
 return true;

 case 'array':
 if (fieldDef.items) {
 const items = fieldDef.items;
 if (items.type === 'object' && items.properties) {
 // Array of objects
 const sampleItem: Record<string, any> = {};
 Object.entries(items.properties).forEach(([itemFieldName, itemFieldDef]: [string, any]) => {
 sampleItem[itemFieldName] = generatePlaceholder(itemFieldName, itemFieldDef);
 });
 return [sampleItem];
 } else if (items.type === 'string') {
 return ['Item 1', 'Item 2', 'Item 3'];
 } else if (items.type === 'number') {
 return [1, 2, 3];
 }
 }
 return ['Sample Item 1', 'Sample Item 2'];

 case 'object':
 if (fieldDef.properties) {
 const nestedObj: Record<string, any> = {};
 Object.entries(fieldDef.properties).forEach(([nestedFieldName, nestedFieldDef]: [string, any]) => {
 nestedObj[nestedFieldName] = generatePlaceholder(nestedFieldName, nestedFieldDef);
 });
 return nestedObj;
 }
 return { sample: 'value' };

 default:
 return `Sample ${fieldNameFormatted}`;
 }
 };

 // Generate placeholders for all top-level fields
 Object.entries(schemaFields).forEach(([fieldName, fieldDef]: [string, any]) => {
 placeholderData[fieldName] = generatePlaceholder(fieldName, fieldDef);
 });

 return placeholderData;
}

/**
 * Schema Preview Component
 * Displays a preview of how extracted data would look using the schema
 */
export function SchemaPreview({ schema }: SchemaPreviewProps) {
 const placeholderData = React.useMemo(() => {
 return generatePlaceholderData(schema);
 }, [schema]);

 if (Object.keys(placeholderData).length === 0) {
 return null;
 }

 return (
 <div className="pt-4 border-t border-slate-200/50">
 <div className="mb-4">
 <h3 className="font-bold text-lg text-foreground mb-2">Extraction Preview</h3>
 <p className="text-sm text-muted-foreground">
 Preview of how extracted data would appear using this schema
 </p>
 </div>
 <BaseCard variant="light"className="p-6">
 <ExtractionDataViewer
 data={placeholderData}
 viewMode="document"
 globalLayout="list"
 hideCopyButtons={true}
 />
 </BaseCard>
 </div>
 );
}
