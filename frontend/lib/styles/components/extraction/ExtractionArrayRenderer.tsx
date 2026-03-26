/**
 * Extraction Array Renderer Component
 * Renders arrays from extraction data (strings, objects, etc.)
 */

"use client";

import React from "react";
import { DocumentFieldCard, Badge, DataTable, ItemHeader } from "@/lib/styles/components";
import { getFieldLabel, isArrayOfObjects, detectValueType, getBooleanLabel } from "@/utils/extraction-data-utils";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ExtractionObjectRenderer } from "./ExtractionObjectRenderer";
import { cn } from "@/lib/utils";

interface ExtractionArrayRendererProps {
 fieldKey: string;
 value: any[];
 label?: string;
 className?: string;
 showHeader?: boolean;
 language?: 'pl' | 'en';
 inline?: boolean; // If true, render inline without card wrapper (for simple arrays)
}

export function ExtractionArrayRenderer({
 fieldKey,
 value,
 label,
 className,
 showHeader = true,
 language = 'pl',
 inline = false,
}: ExtractionArrayRendererProps) {
 const fieldLabel = label || getFieldLabel(fieldKey);

 const handleCopy = () => {
 const textToCopy = JSON.stringify(value, null, 2);
 navigator.clipboard.writeText(textToCopy);
 toast.success("Copied", {
 description: "Copied to clipboard"
 });
 };

 if (!Array.isArray(value) || value.length === 0) {
 // If inline, render without card wrapper
 if (inline) {
 return (
 <div className={className}>
 {showHeader && (
 <ItemHeader title={fieldLabel} className="mb-2 text-muted-foreground"as="h6"/>
 )}
 <p className="text-sm text-muted-foreground italic">No items</p>
 </div>
 );
 }
 return (
 <DocumentFieldCard className={className}>
 <div className="flex items-start justify-between">
 <div className="flex-1">
 <ItemHeader title={fieldLabel} className="mb-2 text-muted-foreground"/>
 <p className="text-sm text-muted-foreground italic">No items</p>
 </div>
 </div>
 </DocumentFieldCard>
 );
 }

 // Array of objects - render as table
 if (isArrayOfObjects(value)) {
 // Get all unique keys from objects
 const allKeys = new Set<string>();
 value.forEach(item => {
 if (typeof item === 'object' && item !== null) {
 Object.keys(item).forEach(key => allKeys.add(key));
 }
 });

 // Helper function to detect if a column is an ID/number column that should be narrow
 const isIdColumn = (key: string): boolean => {
 const idPatterns = [
 /^id$/i,
 /^_id$/i,
 /_id$/i,
 /_number$/i,
 /^number$/i,
 /^num$/i,
 /^index$/i,
 /^idx$/i,
 /question_number/i,
 /item_number/i,
 /row_number/i,
 ];
 return idPatterns.some(pattern => pattern.test(key));
 };

 const columns = Array.from(allKeys).map(key => ({
 key,
 header: getFieldLabel(key),
 // Set narrow width for ID columns
 width: isIdColumn(key) ? 'w-16' : undefined,
 cell: (item: any) => {
 const cellValue = item[key];
 const type = detectValueType(cellValue);

 if (type === 'boolean') {
 return (
 <Badge
 variant={cellValue ? "default": "secondary"}
 className={cn(
"rounded-full px-3 py-1 font-semibold",
 cellValue
 ? "bg-green-100 text-green-700 border-green-300"
 : "bg-red-100 text-red-700 border-red-300"
 )}
 >
 {getBooleanLabel(cellValue, language)}
 </Badge>
 );
 }
 if (type === 'number') {
 return new Intl.NumberFormat('pl-PL').format(cellValue);
 }
 if (type === 'date') {
 try {
 return new Intl.DateTimeFormat('pl-PL', {
 year: 'numeric',
 month: 'long',
 day: 'numeric',
 }).format(new Date(cellValue));
 } catch {
 return String(cellValue);
 }
 }
 if (type === 'array') {
 // Render arrays as simple comma-separated list
 if (Array.isArray(cellValue) && cellValue.length > 0) {
 const itemType = detectValueType(cellValue[0]);
 // Show as comma-separated list for primitive types
 if (itemType === 'string' || itemType === 'number' || itemType === 'date' || itemType === 'boolean') {
 const formattedItems = cellValue.map((v: any) => {
 let displayValue = String(v);

 // Format dates consistently
 if (itemType === 'date') {
 try {
 displayValue = new Intl.DateTimeFormat('pl-PL', {
 year: 'numeric',
 month: 'short',
 day: 'numeric',
 }).format(new Date(v));
 } catch {
 displayValue = String(v);
 }
 }

 // Format numbers consistently
 if (itemType === 'number') {
 displayValue = new Intl.NumberFormat('pl-PL').format(v);
 }

 // Format booleans
 if (itemType === 'boolean') {
 displayValue = getBooleanLabel(v, language);
 }

 return displayValue;
 });

 return (
 <span className="text-sm">
 {formattedItems.join(', ')}
 </span>
 );
 }
 // For arrays of objects or other complex types, show count
 return <span className="text-muted-foreground text-xs">{cellValue.length} items</span>;
 }
 return <span className="text-muted-foreground text-xs">—</span>;
 }
 if (type === 'object') {
 return <span className="text-muted-foreground text-xs">Complex data</span>;
 }
 // For strings, allow text wrapping
 const stringValue = String(cellValue || '—');
 return (
 <div className="w-full">
 <p className="text-sm whitespace-pre-wrap break-words">
 {stringValue}
 </p>
 </div>
 );
 },
 }));

 return (
 <div className={className}>
 {showHeader && (
 <div className="flex items-center justify-between mb-4">
 <ItemHeader title={fieldLabel} />
 <Button
 variant="ghost"
 size="sm"
 onClick={handleCopy}
 className="h-8 w-8 p-0 text-slate-500 hover:text-slate-700"
 title="Copy table data"
 >
 <Copy className="h-4 w-4"/>
 </Button>
 </div>
 )}
 <div className="rounded-lg border border-slate-200/60 bg-slate-50/50 shadow-sm overflow-hidden">
 <DataTable data={value} columns={columns} />
 </div>
 </div>
 );
 }

 // Array of primitives (strings, numbers, booleans, dates)
 // Show as simple list - render inline if inline prop is true, otherwise in card
 const listContent = (
 <ul className="space-y-2">
 {value.map((item, index) => {
 const itemType = detectValueType(item);
 let displayValue = String(item);

 // Format dates consistently
 if (itemType === 'date') {
 try {
 displayValue = new Intl.DateTimeFormat('pl-PL', {
 year: 'numeric',
 month: 'long',
 day: 'numeric',
 }).format(new Date(item));
 } catch {
 displayValue = String(item);
 }
 }

 // Format numbers consistently
 if (itemType === 'number') {
 displayValue = new Intl.NumberFormat('pl-PL').format(item);
 }

 // Format booleans
 if (itemType === 'boolean') {
 displayValue = getBooleanLabel(item, language);
 }

 return (
 <li key={index} className="text-sm text-slate-900 leading-relaxed">
 • {displayValue}
 </li>
 );
 })}
 </ul>
 );

 // If inline, render without card wrapper
 if (inline) {
 return (
 <div className={className}>
 {showHeader && (
 <ItemHeader title={fieldLabel} className="mb-3 text-muted-foreground"as="h6"/>
 )}
 {listContent}
 </div>
 );
 }

 // Otherwise render in card (for standalone arrays)
 return (
 <DocumentFieldCard className={className}>
 {showHeader && (
 <ItemHeader title={fieldLabel} className="mb-3"/>
 )}
 {listContent}
 </DocumentFieldCard>
 );
}
