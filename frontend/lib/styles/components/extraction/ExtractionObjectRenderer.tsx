/**
 * Extraction Object Renderer Component
 * Renders nested objects from extraction data
 */

"use client";

import React from "react";
import { DocumentFieldCard, SectionHeader, ItemHeader } from "@/lib/styles/components";
import { getFieldLabel, detectValueType, isAlphabetLabeledObject, formatFieldValue, getBooleanLabel, formatSectionAsPlainText, FieldGroup, isArrayOfObjects } from "@/utils/extraction-data-utils";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExtractionFieldRenderer } from "./ExtractionFieldRenderer";
import { ExtractionArrayRenderer } from "./ExtractionArrayRenderer";
import { cn } from "@/lib/utils";

// Helper function to group object fields into simple and complex
function groupObjectFields(data: Record<string, any>) {
 const simpleFields: Array<{ key: string; value: any; type: string }> = [];
 const complexFields: Array<{ key: string; value: any; type: string }> = [];

 Object.entries(data).forEach(([key, value]) => {
 const fieldType = detectValueType(value);
 const field = { key, value, type: fieldType };

 // Check if it's a simple field or short array
 if (fieldType === 'string' || fieldType === 'number' || fieldType === 'date' || fieldType === 'boolean' || fieldType === 'null') {
 simpleFields.push(field);
 } else if (fieldType === 'array') {
 // Check if it's a short array with short text items
 if (Array.isArray(value) && value.length > 0 && value.length <= 5) {
 const allItemsShort = value.every((item: any) => {
 if (typeof item === 'string') {
 return item.length <= 10;
 }
 return typeof item === 'number' || detectValueType(item) === 'date';
 });

 if (allItemsShort) {
 simpleFields.push(field);
 } else {
 complexFields.push(field);
 }
 } else {
 complexFields.push(field);
 }
 } else {
 complexFields.push(field);
 }
 });

 return { simpleFields, complexFields };
}

interface ExtractionObjectRendererProps {
 fieldKey: string;
 value: Record<string, any>;
 label?: string;
 className?: string;
 level?: number;
 showHeader?: boolean;
 language?: 'pl' | 'en';
 globalLayout?: 'grid' | 'list';
}

export function ExtractionObjectRenderer({
 fieldKey,
 value,
 label,
 className,
 level = 0,
 showHeader = true,
 language = 'pl',
 globalLayout = 'grid',
}: ExtractionObjectRendererProps) {
 const fieldLabel = label || getFieldLabel(fieldKey);
 const maxDepth = 10; // Prevent infinite recursion - increased to support deep objects

 const handleCopy = () => {
 // Create a FieldGroup for this object to use the formatting function
 const { simpleFields, complexFields } = groupObjectFields(value);
 const allFields = [...simpleFields, ...complexFields];
 const section: FieldGroup = {
 title: fieldLabel,
 fields: allFields,
 };
 const textToCopy = formatSectionAsPlainText(section, language);
 navigator.clipboard.writeText(textToCopy);
 toast.success("Copied", {
 description: `Copied"${fieldLabel}"section to clipboard`
 });
 };

 if (!value || typeof value !== 'object' || Array.isArray(value)) {
 return null;
 }

 const entries = Object.entries(value);

 if (entries.length === 0) {
 return (
 <DocumentFieldCard className={className}>
 <div className="flex items-start justify-between">
 <div className="flex-1">
 <ItemHeader title={fieldLabel} className="mb-2 text-muted-foreground"/>
 <p className="text-sm text-muted-foreground italic">No data</p>
 </div>
 </div>
 </DocumentFieldCard>
 );
 }

 // Check if this is an alphabet-labeled object (e.g., a, b, c, d components)
 const isAlphabetLabeled = isAlphabetLabeledObject(value);

 // For nested objects, show as a section with subsections
 // If showHeader is false, we're inside a parent card, so render inline
 if (level > 0) {
 // Special compact rendering for alphabet-labeled objects
 if (isAlphabetLabeled) {
 const content = (
 <>
 {showHeader && (
 <div className="flex items-start justify-between mb-3">
 <ItemHeader title={fieldLabel} className="text-muted-foreground"/>
 <Button
 variant="ghost"
 size="sm"
 onClick={handleCopy}
 className="h-8 w-8 p-0"
 >
 <Copy className="h-4 w-4"/>
 </Button>
 </div>
 )}
 <dl className="space-y-2">
 {entries.map(([key, val]) => {
 const valType = detectValueType(val);
 const formattedValue = formatFieldValue(val, valType);

 return (
 <div key={key} className="flex gap-3">
 <dt className="text-sm font-semibold text-muted-foreground uppercase shrink-0 w-6">
 {key.toUpperCase()}:
 </dt>
 <dd className="text-sm text-foreground flex-1 break-words">
 {formattedValue}
 </dd>
 </div>
 );
 })}
 </dl>
 </>
 );

 // If inside parent card (showHeader=false), render inline
 if (!showHeader) {
 return <div className={className}>{content}</div>;
 }

 return (
 <DocumentFieldCard className={className}>
 {content}
 </DocumentFieldCard>
 );
 }

 const content = (
 <>
 {showHeader && (
 <div className="flex items-start justify-between mb-4">
 <ItemHeader title={fieldLabel} className="text-muted-foreground"/>
 <Button
 variant="ghost"
 size="sm"
 onClick={handleCopy}
 className="h-8 w-8 p-0"
 >
 <Copy className="h-4 w-4"/>
 </Button>
 </div>
 )}
 <div className="space-y-4">
 {entries.map(([key, val]) => {
 const valType = detectValueType(val);
 const itemLabel = getFieldLabel(key);

 if (valType === 'array') {
 return (
 <ExtractionArrayRenderer
 key={key}
 fieldKey={key}
 value={val}
 label={itemLabel}
 language={language}
 />
 );
 }

 if (valType === 'object' && level < maxDepth) {
 return (
 <ExtractionObjectRenderer
 key={key}
 fieldKey={key}
 value={val}
 label={itemLabel}
 level={level + 1}
 showHeader={false}
 language={language}
 globalLayout={globalLayout}
 />
 );
 }

 return (
 <ExtractionFieldRenderer
 key={key}
 fieldKey={key}
 value={val}
 label={itemLabel}
 language={language}
 />
 );
 })}
 </div>
 </>
 );

 // If inside parent card (showHeader=false), render inline
 if (!showHeader) {
 return <div className={className}>{content}</div>;
 }

 return (
 <DocumentFieldCard className={className}>
 {content}
 </DocumentFieldCard>
 );
 }

 // Top-level object - group fields into simple and complex, show with section header only if showHeader is true
 const { simpleFields, complexFields } = groupObjectFields(value);

 // Check if this object should be rendered as a table (only simple fields, no complex nested structures)
 const shouldRenderAsTable = simpleFields.length > 0 && complexFields.length === 0 && simpleFields.length > 1;

 // Render as table if appropriate
 if (shouldRenderAsTable && level === 0) {
 return (
 <div className={className}>
 {showHeader && (
 <div className="flex items-center justify-between mb-4">
 <SectionHeader title={fieldLabel} showBorder={false} className="mb-0"/>
 <Button
 variant="ghost"
 size="sm"
 onClick={handleCopy}
 className="h-8 w-8 p-0"
 >
 <Copy className="h-4 w-4"/>
 </Button>
 </div>
 )}
 <DocumentFieldCard>
 <div className="overflow-x-auto">
 <table className="w-full border-collapse">
 <thead>
 <tr className="border-b border-border">
 {simpleFields.map((field) => {
 const itemLabel = getFieldLabel(field.key);
 return (
 <th
 key={field.key}
 className="text-left text-sm font-semibold text-muted-foreground px-4 py-2"
 >
 {itemLabel}
 </th>
 );
 })}
 </tr>
 </thead>
 <tbody>
 <tr>
 {simpleFields.map((field) => {
 const fieldType = field.type;
 let displayValue: React.ReactNode;

 if (fieldType === 'boolean') {
 displayValue = (
 <span className={cn(
"inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
 field.value
 ? "bg-green-100 text-green-700"
 : "bg-red-100 text-red-700"
 )}>
 {getBooleanLabel(field.value, language)}
 </span>
 );
 } else {
 displayValue = formatFieldValue(field.value, fieldType);
 }

 return (
 <td
 key={field.key}
 className="text-sm text-foreground px-4 py-2 border-b border-border/50"
 >
 {displayValue}
 </td>
 );
 })}
 </tr>
 </tbody>
 </table>
 </div>
 </DocumentFieldCard>
 </div>
 );
 }

 // Special handling for alphabet-labeled objects at top level
 if (isAlphabetLabeled) {
 return (
 <div className={className}>
 {showHeader && (
 <div className="flex items-center justify-between mb-4">
 <SectionHeader title={fieldLabel} showBorder={false} className="mb-0"/>
 <Button
 variant="ghost"
 size="sm"
 onClick={handleCopy}
 className="h-8 w-8 p-0"
 >
 <Copy className="h-4 w-4"/>
 </Button>
 </div>
 )}
 <DocumentFieldCard>
 <dl className="space-y-2">
 {entries.map(([key, val]) => {
 const valType = detectValueType(val);
 const formattedValue = formatFieldValue(val, valType);

 return (
 <div key={key} className="flex gap-3">
 <dt className="text-sm font-semibold text-muted-foreground uppercase shrink-0 w-6">
 {key.toUpperCase()}:
 </dt>
 <dd className="text-sm text-foreground flex-1 break-words">
 {formattedValue}
 </dd>
 </div>
 );
 })}
 </dl>
 </DocumentFieldCard>
 </div>
 );
 }

 // Top-level object - render all fields in a single card
 const allFields = [...simpleFields, ...complexFields];

 return (
 <div className={className}>
 {showHeader && (
 <div className="flex items-center justify-between mb-4">
 <SectionHeader title={fieldLabel} showBorder={false} className="mb-0"/>
 <Button
 variant="ghost"
 size="sm"
 onClick={handleCopy}
 className="h-8 w-8 p-0"
 >
 <Copy className="h-4 w-4"/>
 </Button>
 </div>
 )}
 <DocumentFieldCard>
 <div className="space-y-6">
 {allFields.map((field) => {
 const itemLabel = getFieldLabel(field.key);
 const fieldType = field.type;

 // Handle arrays
 if (fieldType === 'array') {
 // Check if it's an array of objects (table) or primitives (list)
 const isTable = isArrayOfObjects(field.value);

 return (
 <div key={field.key} className="space-y-2">
 <ItemHeader title={itemLabel} className="text-muted-foreground"as="h6"/>
 <ExtractionArrayRenderer
 fieldKey={field.key}
 value={field.value}
 label={undefined}
 showHeader={false}
 language={language}
 inline={!isTable} // Inline for simple lists, separate for tables
 />
 </div>
 );
 }

 // Handle nested objects
 if (fieldType === 'object' && level < maxDepth) {
 return (
 <div key={field.key} className="space-y-2">
 <ItemHeader title={itemLabel} className="text-muted-foreground"as="h6"/>
 <ExtractionObjectRenderer
 fieldKey={field.key}
 value={field.value}
 label={undefined}
 level={level + 1}
 showHeader={false}
 language={language}
 globalLayout={globalLayout}
 />
 </div>
 );
 }

 // Handle simple fields (string, number, boolean, date, null)
 let displayValue: React.ReactNode;

 if (fieldType === 'boolean') {
 displayValue = (
 <span className={cn(
"inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
 field.value
 ? "bg-green-100 text-green-700"
 : "bg-red-100 text-red-700"
 )}>
 {getBooleanLabel(field.value, language)}
 </span>
 );
 } else {
 displayValue = formatFieldValue(field.value, fieldType);
 }

 return (
 <div key={field.key} className="flex gap-4 items-start">
 <dt className="text-sm font-semibold text-muted-foreground shrink-0 min-w-[140px]">
 {itemLabel}:
 </dt>
 <dd className="text-sm text-foreground flex-1 break-words">
 {displayValue}
 </dd>
 </div>
 );
 })}
 </div>
 </DocumentFieldCard>
 </div>
 );
}
