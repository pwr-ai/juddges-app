"use client";

import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, FileText, Calendar, Tag, User, Info, FileCode, Hash, List, CheckSquare, Link as LinkIcon } from "lucide-react";
import { ExtractionSchema } from "@/types/extraction_schemas";
import { BaseCard } from "./base-card";
import { SecondaryButton } from "./secondary-button";
import { SubsectionHeader } from "./subsection-header";
import { cn } from "@/lib/utils";
import { parseSchemaText, getFieldTypeLabel, formatSchemaFieldName } from "@/lib/schema-utils";

/**
 * Format date string to a human-readable format
 */
const formatDate = (dateString: string | null | undefined): string => {
 if (!dateString) return"N/A";
 try {
 const date = new Date(dateString);
 if (isNaN(date.getTime())) return dateString; // Return original if invalid
 return new Intl.DateTimeFormat('en-US', {
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 }).format(date);
 } catch {
 return dateString;
 }
};

/**
 * Get type style (color, background, border, icon) for type badges
 * Matches the styling used in SchemaFieldsTable
 */
const getTypeStyle = (type: string) => {
 const normalizedType = type.toLowerCase();
 const styles: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
 date: {
 color: 'text-blue-700',
 bg: 'bg-blue-100/80',
 border: 'border-blue-200/60',
 icon: <Calendar className="h-3.5 w-3.5"/>
 },
 text: {
 color: 'text-slate-700',
 bg: 'bg-slate-100/80',
 border: 'border-slate-200/60',
 icon: <FileCode className="h-3.5 w-3.5"/>
 },
 string: {
 color: 'text-slate-700',
 bg: 'bg-slate-100/80',
 border: 'border-slate-200/60',
 icon: <FileCode className="h-3.5 w-3.5"/>
 },
 list: {
 color: 'text-purple-700',
 bg: 'bg-purple-100/80',
 border: 'border-purple-200/60',
 icon: <List className="h-3.5 w-3.5"/>
 },
 array: {
 color: 'text-purple-700',
 bg: 'bg-purple-100/80',
 border: 'border-purple-200/60',
 icon: <List className="h-3.5 w-3.5"/>
 },
 number: {
 color: 'text-emerald-700',
 bg: 'bg-emerald-100/80',
 border: 'border-emerald-200/60',
 icon: <Hash className="h-3.5 w-3.5"/>
 },
 integer: {
 color: 'text-emerald-700',
 bg: 'bg-emerald-100/80',
 border: 'border-emerald-200/60',
 icon: <Hash className="h-3.5 w-3.5"/>
 },
 boolean: {
 color: 'text-amber-700',
 bg: 'bg-amber-100/80',
 border: 'border-amber-200/60',
 icon: <CheckSquare className="h-3.5 w-3.5"/>
 },
 'yes/no': {
 color: 'text-amber-700',
 bg: 'bg-amber-100/80',
 border: 'border-amber-200/60',
 icon: <CheckSquare className="h-3.5 w-3.5"/>
 },
 object: {
 color: 'text-indigo-700',
 bg: 'bg-indigo-100/80',
 border: 'border-indigo-200/60',
 icon: <FileCode className="h-3.5 w-3.5"/>
 },
 enum: {
 color: 'text-violet-700',
 bg: 'bg-violet-100/80',
 border: 'border-violet-200/60',
 icon: <CheckSquare className="h-3.5 w-3.5"/>
 },
 email: {
 color: 'text-cyan-700',
 bg: 'bg-cyan-100/80',
 border: 'border-cyan-200/60',
 icon: <LinkIcon className="h-3.5 w-3.5"/>
 },
 };

 return styles[normalizedType] || {
 color: 'text-slate-700',
 bg: 'bg-slate-100/80',
 border: 'border-slate-200/60',
 icon: <FileCode className="h-3.5 w-3.5"/>
 };
};

export interface SchemaPreviewProps {
 schema: ExtractionSchema | null;
 onGenerateNew?: () => void;
 className?: string;
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 messages?: any[]; // Optional for backward compatibility (currently unused)
}

export function SchemaPreview({ schema, onGenerateNew, className }: SchemaPreviewProps): React.JSX.Element {
 const [showRawSchema, setShowRawSchema] = useState(false);

 // Memoize parsed schema to avoid re-parsing on every render
 // Must be called before any conditional returns (React hooks rules)
 const parsedSchema = useMemo(() => {
 if (!schema) return null;
 return parseSchemaText(schema.text);
 }, [schema]);

 if (!schema) {
 return (
 <BaseCard
 title="Schema Preview"
 icon={FileText}
 className={cn("p-6", className)}
 clickable={false}
 >
 <div className="text-center py-8">
 <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50"/>
 <p className="text-sm text-muted-foreground mb-4">Select a schema to preview its structure</p>
 {onGenerateNew && (
 <SecondaryButton onClick={onGenerateNew} size="md">
 Generate New Schema
 </SecondaryButton>
 )}
 </div>
 </BaseCard>
 );
 }

 return (
 <BaseCard
 title="Schema Preview"
 icon={FileText}
 className={cn("p-6", className)}
 clickable={false}
 >
 <div className="space-y-6 -mt-3">
 {/* Header with toggle - positioned to align with BaseCard header row */}
 <div className="relative -mt-8 -mr-2 mb-1 flex justify-end">
 <SecondaryButton
 size="sm"
 onClick={() => setShowRawSchema(!showRawSchema)}
 icon={showRawSchema ? EyeOff : Eye}
 aria-label={showRawSchema ? "Hide raw schema JSON view": "Show raw schema JSON view"}
 >
 {showRawSchema ? "Hide Raw": "Show Raw"}
 </SecondaryButton>
 </div>

 {/* Schema Metadata */}
 <div className="space-y-3">
 <div>
 <div className="flex items-center justify-between mb-1">
 <h3 className="font-bold text-lg">{formatSchemaFieldName(schema.name)}</h3>
 {schema.created_at && (
 <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
 <Calendar className="h-3.5 w-3.5"/>
 <span>Created {formatDate(schema.created_at)}</span>
 </div>
 )}
 </div>
 <p className="text-sm text-muted-foreground">{schema.description}</p>
 </div>
 <div className="flex flex-wrap gap-2">
 <Badge variant="outline"className="text-xs">
 {schema.type}
 </Badge>
 <Badge variant="outline"className="text-xs">
 {schema.category}
 </Badge>
 </div>
 </div>

 {/* Schema Structure */}
 {!showRawSchema && parsedSchema && (() => {
 // Handle JSON Schema format - extract properties if present
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 const schemaFields = (parsedSchema.properties as Record<string, any>) || parsedSchema;
 const fieldEntries = Object.entries(schemaFields);

 return (
 <div className="space-y-4">
 <div className="flex items-center justify-between">
 <SubsectionHeader title="Extraction Fields"/>
 {fieldEntries.length > 3 && (
 <span className="text-xs text-muted-foreground">
 {fieldEntries.length} fields
 </span>
 )}
 </div>
 <div className="relative">
 <div className={cn(
"space-y-2 max-h-[400px] overflow-y-auto",
"border border-slate-200/50 rounded-lg p-2 pr-2",
 // Custom scrollbar styling - highly visible and prominent scrollbar
"[&::-webkit-scrollbar]:w-4",
"[&::-webkit-scrollbar-track]:bg-slate-300/80 [&::-webkit-scrollbar-track]: ",
"[&::-webkit-scrollbar-track]:rounded-full",
"[&::-webkit-scrollbar-track]:my-1",
"[&::-webkit-scrollbar-thumb]:bg-slate-500 [&::-webkit-scrollbar-thumb]: ",
"[&::-webkit-scrollbar-thumb]:rounded-full",
"[&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-slate-300/80 [&::-webkit-scrollbar-thumb]: ",
"[&::-webkit-scrollbar-thumb]:hover:bg-slate-600 [&::-webkit-scrollbar-thumb]: ",
"[&::-webkit-scrollbar-thumb]:active:bg-slate-700 [&::-webkit-scrollbar-thumb]: ",
"[&::-webkit-scrollbar-thumb]:transition-colors",
"[&::-webkit-scrollbar-thumb]:shadow-sm",
 // Firefox scrollbar - more visible
"scrollbar-thin scrollbar-thumb-slate-500 scrollbar-thumb-rounded-full",
"scrollbar-track-slate-300/80"
 )}>
 {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
 {fieldEntries.map(([fieldName, fieldDef]: [string, any]) => {
 return (
 <div
 key={fieldName}
 className={cn(
"rounded-lg p-3 border",
"bg-slate-50/50",
"border-slate-200/50",
"hover:border-primary/30 transition-colors"
 )}
 >
 <div className="flex items-center justify-between mb-2">
 <span className="font-semibold text-sm">{formatSchemaFieldName(fieldName)}</span>
 <div className="flex gap-1.5">
 {(() => {
 const fieldType = fieldDef?.type || 'string';
 const typeLabel = getFieldTypeLabel(fieldType);
 const style = getTypeStyle(fieldType);
 return (
 <Badge
 variant="outline"
 className={cn(
"flex items-center justify-start gap-1.5 px-3 py-1.5 text-xs font-semibold",
"backdrop-blur-sm shadow-sm ring-1",
 style.color,
 style.bg,
 style.border,
"ring-slate-200/20"
 )}
 >
 {style.icon}
 <span>{typeLabel}</span>
 </Badge>
 );
 })()}
 </div>
 </div>

 {/* Description */}
 {fieldDef.description && (
 <div className="mb-3">
 <div className="flex items-start gap-2">
 <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0"/>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {fieldDef.description}
 </p>
 </div>
 </div>
 )}

 {/* Field Details Grid */}
 <div className="space-y-2">
 {/* Default Value */}
 {fieldDef.default !== undefined && fieldDef.default !== null && (
 <div className="flex items-center gap-2 text-xs">
 <span className="text-muted-foreground font-medium min-w-[80px]">Default:</span>
 <code className={cn(
"px-2 py-0.5 rounded bg-slate-100",
"text-slate-900",
"border border-slate-200"
 )}>
 {typeof fieldDef.default === 'object'
 ? JSON.stringify(fieldDef.default)
 : String(fieldDef.default)}
 </code>
 </div>
 )}

 {/* Example */}
 {fieldDef.example !== undefined && fieldDef.example !== null && (
 <div className="flex items-center gap-2 text-xs">
 <span className="text-muted-foreground font-medium min-w-[80px]">Example:</span>
 <code className={cn(
"px-2 py-0.5 rounded bg-blue-50",
"text-blue-900",
"border border-blue-200"
 )}>
 {typeof fieldDef.example === 'object'
 ? JSON.stringify(fieldDef.example)
 : String(fieldDef.example)}
 </code>
 </div>
 )}

 {/* Format */}
 {fieldDef.format && (
 <div className="flex items-center gap-2 text-xs">
 <span className="text-muted-foreground font-medium min-w-[80px]">Format:</span>
 <Badge variant="outline"className="text-xs">
 {fieldDef.format}
 </Badge>
 </div>
 )}

 {/* Number constraints */}
 {(fieldDef.minimum !== undefined || fieldDef.maximum !== undefined || fieldDef.exclusiveMinimum !== undefined || fieldDef.exclusiveMaximum !== undefined) && (
 <div className="flex items-center gap-2 text-xs flex-wrap">
 <span className="text-muted-foreground font-medium min-w-[80px]">Value range:</span>
 <div className="flex items-center gap-1.5">
 {fieldDef.exclusiveMinimum !== undefined ? (
 <span className="text-muted-foreground">greater than {fieldDef.exclusiveMinimum}</span>
 ) : fieldDef.minimum !== undefined ? (
 <span className="text-muted-foreground">at least {fieldDef.minimum}</span>
 ) : null}
 {fieldDef.minimum !== undefined && fieldDef.maximum !== undefined && (
 <span className="text-muted-foreground">to</span>
 )}
 {fieldDef.exclusiveMaximum !== undefined ? (
 <span className="text-muted-foreground">less than {fieldDef.exclusiveMaximum}</span>
 ) : fieldDef.maximum !== undefined ? (
 <span className="text-muted-foreground">up to {fieldDef.maximum}</span>
 ) : null}
 </div>
 </div>
 )}

 {/* Text length constraints */}
 {(fieldDef.minLength !== undefined || fieldDef.maxLength !== undefined) && (
 <div className="flex items-center gap-2 text-xs">
 <span className="text-muted-foreground font-medium min-w-[80px]">Text length:</span>
 <span className="text-muted-foreground">
 {fieldDef.minLength !== undefined && fieldDef.maxLength !== undefined
 ? `${fieldDef.minLength} - ${fieldDef.maxLength} characters`
 : fieldDef.minLength !== undefined
 ? `at least ${fieldDef.minLength} characters`
 : `up to ${fieldDef.maxLength} characters`}
 </span>
 </div>
 )}

 {/* Pattern */}
 {fieldDef.pattern && (
 <div className="flex items-start gap-2 text-xs">
 <span className="text-muted-foreground font-medium min-w-[80px] shrink-0">Pattern:</span>
 <code className={cn(
"px-2 py-0.5 rounded bg-purple-50",
"text-purple-900",
"border border-purple-200",
"break-all font-mono text-[10px]"
 )}>
 {fieldDef.pattern}
 </code>
 </div>
 )}

 {/* Enum values */}
 {fieldDef.enum && (
 <div className="pt-2 border-t border-slate-200/50">
 <span className="text-xs text-muted-foreground font-medium block mb-1.5">Permitted values:</span>
 <div className="flex gap-1.5 flex-wrap">
 {fieldDef.enum.map((value: string | number | boolean, idx: number) => (
 <Badge
 key={idx}
 variant="secondary"
 className="text-xs bg-indigo-400/15 text-indigo-900 border-indigo-400/30"
 >
 {String(value)}
 </Badge>
 ))}
 </div>
 </div>
 )}

 {/* List constraints */}
 {(fieldDef.minItems !== undefined || fieldDef.maxItems !== undefined || fieldDef.uniqueItems) && (
 <div className="flex items-center gap-2 text-xs flex-wrap">
 <span className="text-muted-foreground font-medium min-w-[80px]">List size:</span>
 <div className="flex items-center gap-1.5">
 {fieldDef.minItems !== undefined && fieldDef.maxItems !== undefined && (
 <span className="text-muted-foreground">{fieldDef.minItems} - {fieldDef.maxItems} items</span>
 )}
 {fieldDef.minItems !== undefined && !fieldDef.maxItems && (
 <span className="text-muted-foreground">at least {fieldDef.minItems} items</span>
 )}
 {!fieldDef.minItems && fieldDef.maxItems !== undefined && (
 <span className="text-muted-foreground">up to {fieldDef.maxItems} items</span>
 )}
 {fieldDef.uniqueItems && (
 <Badge variant="outline"className="text-xs ml-1">
 no duplicates
 </Badge>
 )}
 </div>
 </div>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </div>
 </div>
 );
 })()}

 {/* Raw Schema */}
 {showRawSchema && (
 <div className="space-y-3">
 <SubsectionHeader title="Raw Schema"/>
 <pre
 className={cn(
"p-4 rounded-lg text-sm overflow-auto max-h-96",
"bg-slate-50/50",
"border border-slate-200/50",
"font-mono"
 )}
 role="text"
 aria-label="Raw schema JSON definition"
 >
 {JSON.stringify(parsedSchema || schema.text, null, 2)}
 </pre>
 </div>
 )}

 {/* Schema Dates */}
 {schema.dates && Object.keys(schema.dates).length > 0 && (
 <div className="space-y-3 pt-2 border-t border-slate-200/50">
 <SubsectionHeader title="Important Dates"/>
 <div className="space-y-2">
 {Object.entries(schema.dates).map(([key, value]) => (
 <div
 key={key}
 className={cn(
"flex items-center justify-between p-2 rounded-md",
"bg-slate-50/50"
 )}
 >
 <div className="flex items-center gap-2">
 <Calendar className="h-3.5 w-3.5 text-muted-foreground"/>
 <span className="text-sm text-muted-foreground">{key}:</span>
 </div>
 <span className="text-sm font-medium">{formatDate(value as string)}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 {/* Schema Metadata Footer */}
 {schema.user?.email && (
 <div className={cn(
"pt-4 border-t border-slate-200/50",
"flex items-center gap-4 text-xs text-muted-foreground"
 )}>
 <div className="flex items-center gap-1.5">
 <User className="h-3.5 w-3.5"/>
 <span>{schema.user.email}</span>
 </div>
 </div>
 )}

 </div>
 </BaseCard>
 );
}
