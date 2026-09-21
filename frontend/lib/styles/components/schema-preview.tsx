"use client";

import React, { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, FileText, Calendar, Tag, User, Info } from "lucide-react";
import { ExtractionSchema } from "@/types/extraction_schemas";
import { BaseCard } from "./base-card";
import { VariantButton } from './variant-button';
import { SubsectionHeader } from "./subsection-header";
import { cn } from "@/lib/utils";
import { parseSchemaText, getFieldTypeLabel, formatSchemaFieldName } from "@/lib/schema-utils";
import { FieldTypeBadge } from "@/components/editorial";

/**
 * Format date string to a human-readable format
 */
const formatDate = (dateString: string | null | undefined): string => {
 if (!dateString) return "N/A";
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
 <VariantButton intent="secondary" onClick={onGenerateNew} size="md">
 Generate New Schema
 </VariantButton>
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
 <VariantButton intent="secondary"
 size="sm"
 onClick={() => setShowRawSchema(!showRawSchema)}
 icon={showRawSchema ? EyeOff : Eye}
 aria-label={showRawSchema ? "Hide raw schema JSON view": "Show raw schema JSON view"}
 >
 {showRawSchema ? "Hide Raw": "Show Raw"}
 </VariantButton>
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
 <Badge variant="outline" className="text-xs rounded-none border-rule">
 {schema.type}
 </Badge>
 <Badge variant="outline" className="text-xs rounded-none border-rule">
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
 "border border-rule rounded-none p-2 pr-2"
 )}>
 {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
 {fieldEntries.map(([fieldName, fieldDef]: [string, any]) => {
 return (
 <div
 key={fieldName}
 className={cn(
 "rounded-none p-3 border",
 "bg-parchment-deep/40",
 "border-rule",
 "hover:border-oxblood/30 transition-colors"
 )}
 >
 <div className="flex items-center justify-between mb-2">
 <span className="font-semibold text-sm">{formatSchemaFieldName(fieldName)}</span>
 <div className="flex gap-1.5">
 <FieldTypeBadge type={fieldDef?.type || 'string'} />
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
 "px-2 py-0.5 rounded-none bg-parchment-deep",
 "text-ink font-mono",
 "border border-rule"
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
 "px-2 py-0.5 rounded-none bg-parchment-deep",
 "text-ink font-mono",
 "border border-rule"
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
 <Badge variant="outline" className="text-xs rounded-none border-rule">
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
 "px-2 py-0.5 rounded-none bg-parchment-deep",
 "text-ink font-mono",
 "border border-rule",
 "break-all text-[10px]"
 )}>
 {fieldDef.pattern}
 </code>
 </div>
 )}

 {/* Enum values */}
 {fieldDef.enum && (
 <div className="pt-2 border-t border-rule">
 <span className="text-xs text-muted-foreground font-medium block mb-1.5">Permitted values:</span>
 <div className="flex gap-1.5 flex-wrap">
 {fieldDef.enum.map((value: string | number | boolean, idx: number) => (
 <Badge
 key={idx}
 variant="secondary"
 className="text-xs bg-parchment-deep text-ink border-rule rounded-none"
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
 <Badge variant="outline" className="text-xs ml-1 rounded-none border-rule">
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
 "p-4 rounded-none text-sm overflow-auto max-h-96",
 "bg-parchment-deep/40 text-ink",
 "border border-rule",
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
 <div className="space-y-3 pt-2 border-t border-rule">
 <SubsectionHeader title="Important Dates"/>
 <div className="space-y-2">
 {Object.entries(schema.dates).map(([key, value]) => (
 <div
 key={key}
 className={cn(
 "flex items-center justify-between p-2 rounded-none",
 "bg-parchment-deep/40 border border-rule"
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
 "pt-4 border-t border-rule",
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
