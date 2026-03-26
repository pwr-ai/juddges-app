/**
 * Schema Field Card Component
 * Reusable card component for displaying extraction schema fields
 * Supports both simple and nested fields
 */

"use client";

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Info, FileCode } from 'lucide-react';
import { AIBadge } from './ai-badge';
import { cn } from '@/lib/utils';
import { getFieldTypeLabel, formatSchemaFieldName } from '@/lib/schema-utils';

export interface SchemaFieldCardProps {
 /** Field name */
 fieldName: string;
 /** Field definition object */
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 fieldDef: any;
 /** Whether the field is required */
 isRequired?: boolean;
 /** Nesting depth (0 = root level) */
 depth?: number;
 /** Whether this is a nested field (not a simple field) */
 isNestedField?: boolean;
 /** Optional className for additional styling */
 className?: string;
}

/**
 * Schema Field Card Component
 *
 * A reusable card component for displaying schema field information.
 * Supports both simple fields and nested fields with proper styling.
 *
 * @example
 * ```tsx
 * <SchemaFieldCard
 * fieldName="party_name"
 * fieldDef={{ type: "string", description: "Name of party"}}
 * isRequired={true}
 * />
 * ```
 */
export function SchemaFieldCard({
 fieldName,
 fieldDef,
 isRequired = false,
 depth = 0,
 isNestedField = false,
 className,
}: SchemaFieldCardProps): React.JSX.Element {
 const fieldType = fieldDef?.type || 'string';
 const fieldDescription = fieldDef?.description || '';

 // Check for nested properties
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 let nestedProperties: Record<string, any> | null = null;
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 let nestedRequired: string[] = [];

 if (fieldType === 'object' && fieldDef?.properties) {
 nestedProperties = fieldDef.properties;
 nestedRequired = Array.isArray(fieldDef.required) ? fieldDef.required : [];
 } else if (fieldType === 'array' && fieldDef?.items) {
 const items = fieldDef.items;
 if (items && typeof items === 'object' && items.type === 'object' && items.properties) {
 nestedProperties = items.properties;
 nestedRequired = Array.isArray(items.required) ? items.required : [];
 }
 }

 const hasNested = !!nestedProperties && Object.keys(nestedProperties).length > 0;

 return (
 <div
 className={cn(
"rounded-lg p-4 border flex flex-col",
 depth === 0
 ? isNestedField
 ? "bg-white/60 border-slate-200/50 w-full"
 : "bg-white/60 border-slate-200/50 h-full"
 : "bg-slate-50/40 border-slate-300/40 border-l-2 border-l-primary/30",
"hover:border-primary/30 hover:shadow-md transition-all",
 depth === 0 && !isNestedField &&"hover:scale-[1.02]",
 className
 )}
 >
 <div className="flex items-start justify-between mb-2 gap-2">
 <div className="flex items-center gap-1.5 flex-1 min-w-0">
 {depth > 0 && (
 <span className="text-muted-foreground text-xs shrink-0">└─</span>
 )}
 <span className="font-semibold text-sm text-foreground truncate">
 {formatSchemaFieldName(fieldName)}
 </span>
 {hasNested && (
 <Badge variant="outline"className="text-xs shrink-0">
 nested
 </Badge>
 )}
 {isRequired && (
 <Badge variant="outline"className="text-xs shrink-0 bg-red-50 text-red-700 border-red-200">
 required
 </Badge>
 )}
 </div>
 <div className="flex gap-1.5 flex-wrap shrink-0">
 <AIBadge
 text={getFieldTypeLabel(fieldType)}
 icon={FileCode}
 size="sm"
 />
 </div>
 </div>

 {fieldDescription ? (
 <div className="mb-3 flex-1">
 <div className="flex items-start gap-2">
 <Info className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0"/>
 <p className="text-sm text-muted-foreground leading-relaxed">
 {fieldDescription}
 </p>
 </div>
 </div>
 ) : (
 <div className="mb-3 flex-1">
 <p className="text-xs text-muted-foreground italic">
 No description provided
 </p>
 </div>
 )}

 <div className="space-y-2 mt-auto">
 {/* Default Value */}
 {fieldDef.default !== undefined && fieldDef.default !== null && (
 <div className="flex flex-col gap-1 text-xs">
 <span className="text-muted-foreground font-medium">Default:</span>
 <code className={cn(
"px-2 py-1 rounded bg-slate-100",
"text-slate-900",
"border border-slate-200",
"break-words"
 )}>
 {typeof fieldDef.default === 'object'
 ? JSON.stringify(fieldDef.default)
 : String(fieldDef.default)}
 </code>
 </div>
 )}

 {/* Example */}
 {fieldDef.example !== undefined && fieldDef.example !== null && (
 <div className="flex flex-col gap-1 text-xs">
 <span className="text-muted-foreground font-medium">Example:</span>
 <code className={cn(
"px-2 py-1 rounded bg-blue-50",
"text-blue-900",
"border border-blue-200",
"break-words"
 )}>
 {typeof fieldDef.example === 'object'
 ? JSON.stringify(fieldDef.example)
 : String(fieldDef.example)}
 </code>
 </div>
 )}

 {/* Enum values */}
 {fieldDef.enum && Array.isArray(fieldDef.enum) && fieldDef.enum.length > 0 && (
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
 <div className="pt-2 border-t border-slate-200/50">
 <span className="text-xs text-muted-foreground font-medium block mb-1.5">List constraints:</span>
 <div className="flex items-center gap-1.5 flex-wrap">
 {fieldDef.minItems !== undefined && fieldDef.maxItems !== undefined
 ? <Badge variant="outline"className="text-xs">{fieldDef.minItems} - {fieldDef.maxItems} items</Badge>
 : fieldDef.minItems !== undefined
 ? <Badge variant="outline"className="text-xs">at least {fieldDef.minItems} items</Badge>
 : fieldDef.maxItems !== undefined
 ? <Badge variant="outline"className="text-xs">up to {fieldDef.maxItems} items</Badge>
 : null}
 {fieldDef.uniqueItems && (
 <Badge variant="outline"className="text-xs">
 no duplicates
 </Badge>
 )}
 </div>
 </div>
 )}

 {/* Number constraints */}
 {(fieldDef.minimum !== undefined || fieldDef.maximum !== undefined || fieldDef.exclusiveMinimum !== undefined || fieldDef.exclusiveMaximum !== undefined) && (
 <div className="pt-2 border-t border-slate-200/50">
 <span className="text-xs text-muted-foreground font-medium block mb-1.5">Value range:</span>
 <div className="flex items-center gap-1.5 flex-wrap">
 {fieldDef.exclusiveMinimum !== undefined ? (
 <Badge variant="outline"className="text-xs">greater than {fieldDef.exclusiveMinimum}</Badge>
 ) : fieldDef.minimum !== undefined ? (
 <Badge variant="outline"className="text-xs">at least {fieldDef.minimum}</Badge>
 ) : null}
 {(fieldDef.minimum !== undefined || fieldDef.exclusiveMinimum !== undefined) && (fieldDef.maximum !== undefined || fieldDef.exclusiveMaximum !== undefined) && (
 <span className="text-muted-foreground text-xs">to</span>
 )}
 {fieldDef.exclusiveMaximum !== undefined ? (
 <Badge variant="outline"className="text-xs">less than {fieldDef.exclusiveMaximum}</Badge>
 ) : fieldDef.maximum !== undefined ? (
 <Badge variant="outline"className="text-xs">up to {fieldDef.maximum}</Badge>
 ) : null}
 </div>
 </div>
 )}

 {/* Text length constraints */}
 {(fieldDef.minLength !== undefined || fieldDef.maxLength !== undefined) && (
 <div className="pt-2 border-t border-slate-200/50">
 <span className="text-xs text-muted-foreground font-medium block mb-1.5">Text length:</span>
 <div className="flex items-center gap-1.5 flex-wrap">
 {fieldDef.minLength !== undefined && fieldDef.maxLength !== undefined
 ? <Badge variant="outline"className="text-xs">{fieldDef.minLength} - {fieldDef.maxLength} characters</Badge>
 : fieldDef.minLength !== undefined
 ? <Badge variant="outline"className="text-xs">at least {fieldDef.minLength} characters</Badge>
 : fieldDef.maxLength !== undefined
 ? <Badge variant="outline"className="text-xs">up to {fieldDef.maxLength} characters</Badge>
 : null}
 </div>
 </div>
 )}

 {/* Pattern */}
 {fieldDef.pattern && (
 <div className="pt-2 border-t border-slate-200/50">
 <span className="text-xs text-muted-foreground font-medium block mb-1.5">Pattern:</span>
 <code className={cn(
"px-2 py-1 rounded bg-purple-50",
"text-purple-900",
"border border-purple-200",
"break-words font-mono text-[10px]"
 )}>
 {fieldDef.pattern}
 </code>
 </div>
 )}
 </div>

 {/* Recursively render nested fields inside parent card */}
 {hasNested && nestedProperties && (
 <div className="mt-4 pt-4 border-t border-slate-200/50">
 <div className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
 Nested Fields
 </div>
 <div className="space-y-3">
 {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
 {Object.entries(nestedProperties).map(([nestedFieldName, nestedFieldDef]: [string, any]) => (
 <SchemaFieldCard
 key={nestedFieldName}
 fieldName={nestedFieldName}
 fieldDef={nestedFieldDef}
 isRequired={nestedRequired.includes(nestedFieldName)}
 depth={depth + 1}
 />
 ))}
 </div>
 </div>
 )}
 </div>
 );
}
