"use client";

import {
 ColumnDef,
 flexRender,
 getCoreRowModel,
 useReactTable,
 SortingState,
 getSortedRowModel,
 ColumnFiltersState,
 getFilteredRowModel,
 VisibilityState,
} from "@tanstack/react-table";
import {
 Table,
 TableBody,
 TableCell,
 TableHead,
 TableHeader,
 TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Search, FileCode, Calendar, List, Hash, CheckSquare, Link as LinkIcon, Check, X, Type } from "lucide-react";
import { useState } from "react";
import { FlatField, formatSchemaFieldName, getFieldTypeLabel } from "@/lib/schema-utils";
import { Badge, SecondaryButton, DropdownButton } from "@/lib/styles/components";
import { cn } from "@/lib/utils";

interface SchemaFieldsTableProps {
 /** Flattened field data */
 fields: FlatField[];
 /** Optional callback for row click */
 onRowClick?: (field: FlatField) => void;
 /** Callback when a field is updated */
 onFieldUpdate?: (fieldPath: string, updates: { name?: string; description?: string; type?: string }) => void;
 /** Whether cells are editable */
 editable?: boolean;
}

/**
 * Enhanced table view for schema fields with sorting, filtering, and search
 */
export function SchemaFieldsTable({ fields, onRowClick, onFieldUpdate, editable = false }: SchemaFieldsTableProps) {
 const [sorting, setSorting] = useState<SortingState>([]);
 const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
 const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
 const [globalFilter, setGlobalFilter] = useState("");
 const [editingCell, setEditingCell] = useState<{ rowId: string; column: string } | null>(null);
 const [editValue, setEditValue] = useState<string>("");

 // Get display type - if validation contains"Format: date", show as date type
 // If validation contains enum values, show as enum type
 const getDisplayType = (field: FlatField): string => {
 if (field.validation && field.validation.includes('Format: date')) {
 return 'date';
 }
 // Check if field has enum validation (could be"Enum: "or"Allowed values: "or contains enum values)
 if (field.validation && (
 field.validation.toLowerCase().includes('enum:') ||
 field.validation.toLowerCase().includes('allowed values:') ||
 field.validation.toLowerCase().includes('enum values:')
 )) {
 return 'enum';
 }
 return field.type;
 };

 // Get type color and icon
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

 // Handle cell edit
 const handleCellEdit = (rowId: string, column: string, currentValue: string) => {
 if (!editable || !onFieldUpdate) return;
 setEditingCell({ rowId, column });
 setEditValue(currentValue);
 };

 const handleCellSave = (row: FlatField) => {
 if (!editingCell || !onFieldUpdate) return;

 const updates: { name?: string; description?: string; type?: string } = {};
 if (editingCell.column === "name") {
 updates.name = editValue.trim();
 } else if (editingCell.column === "description") {
 updates.description = editValue.trim();
 }

 if (Object.keys(updates).length > 0) {
 onFieldUpdate(row.path, updates);
 }

 setEditingCell(null);
 setEditValue("");
 };

 const handleTypeChange = (row: FlatField, newTypeLabel: string) => {
 if (!onFieldUpdate) return;

 // Map display label back to actual type
 // The newTypeLabel is the display label (text, number, yes/no, list, nested, choice)
 // We need to pass the actual type value
 const typeMap: Record<string, string> = {
"text": "string",
"number": "number",
"yes/no": "boolean",
"list": "array",
"nested": "object",
"choice": "string", // enum is stored as string with enum validation
 };

 const actualType = typeMap[newTypeLabel] || newTypeLabel;
 onFieldUpdate(row.path, { type: actualType });
 };

 const handleCellCancel = () => {
 setEditingCell(null);
 setEditValue("");
 };

 // Define columns
 const columns: ColumnDef<FlatField>[] = [
 {
 accessorKey: "path",
 header: "Field Name",
 cell: ({ row }) => {
 const level = row.original.level;
 const isNested = level > 0;
 const isEditing = editable && editingCell?.rowId === row.id && editingCell?.column === "name";
 const displayName = formatSchemaFieldName(row.original.name);

 return (
 <div
 className={cn(
"flex items-center gap-2 py-1 w-full min-w-[250px] max-w-[500px]",
 isNested &&"border-l-2 border-l-primary/30 pl-3 ml-2 backdrop-blur-sm bg-primary/5 rounded-r-md pr-2"
 )}
 style={{ paddingLeft: isNested ? undefined : `${level * 20}px` }}
 >
 {isNested && (
 <span className="text-primary/70 text-sm shrink-0 font-mono drop-shadow-sm">└</span>
 )}
 {isEditing ? (
 <div className="flex flex-col gap-2 w-full min-w-[250px] max-w-[500px]"onClick={(e) => e.stopPropagation()}>
 <Input
 value={editValue}
 onChange={(e) => {
 e.stopPropagation();
 setEditValue(e.target.value);
 }}
 onKeyDown={(e) => {
 e.stopPropagation();
 if (e.key === "Enter") {
 e.preventDefault();
 handleCellSave(row.original);
 } else if (e.key === "Escape") {
 e.preventDefault();
 handleCellCancel();
 }
 }}
 onBlur={(e) => {
 e.stopPropagation();
 // Small delay to allow button clicks to register
 setTimeout(() => {
 if (editingCell?.rowId === row.id && editingCell?.column === "name") {
 handleCellSave(row.original);
 }
 }, 200);
 }}
 autoFocus
 className={cn(
"h-9 text-sm font-semibold w-full",
"bg-white",
"border-2 border-primary/50",
"ring-2 ring-primary/20",
"focus:border-primary focus:ring-primary/40"
 )}
 onClick={(e) => e.stopPropagation()}
 onFocus={(e) => e.stopPropagation()}
 placeholder="Enter field name..."
 />
 <div className="flex items-center gap-2 justify-end">
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleCellSave(row.original);
 }}
 className="px-3 py-1.5 text-xs font-medium hover:bg-primary/10 rounded transition-colors flex items-center gap-1.5"
 title="Save"
 >
 <Check className="h-3.5 w-3.5 text-primary"/>
 <span className="text-primary">Save</span>
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleCellCancel();
 }}
 className="px-3 py-1.5 text-xs font-medium hover:bg-destructive/10 rounded transition-colors flex items-center gap-1.5"
 title="Cancel"
 >
 <X className="h-3.5 w-3.5 text-destructive"/>
 <span className="text-destructive">Cancel</span>
 </button>
 </div>
 </div>
 ) : (
 <span
 className={cn(
"font-semibold",
 isNested ? "text-sm text-foreground/90": "text-base text-foreground",
 editable && onFieldUpdate &&"cursor-pointer hover:text-primary transition-colors"
 )}
 onClick={(e) => {
 if (editable && onFieldUpdate) {
 e.stopPropagation();
 handleCellEdit(row.id,"name", row.original.name);
 }
 }}
 >
 {displayName}
 </span>
 )}
 </div>
 );
 },
 },
 {
 accessorKey: "type",
 header: "Type",
 cell: ({ row }) => {
 const displayType = getDisplayType(row.original);
 const typeLabel = getFieldTypeLabel(displayType);
 const style = getTypeStyle(displayType);

 // Nested and choice types should not be changeable in table view - use field editor instead
 const isComplexType = typeLabel === "nested"|| typeLabel === "choice";

 if (editable && onFieldUpdate && !isComplexType) {
 // Only allow simple types to be changed in table view
 const availableOptions = [
 { value: "text", label: "text"},
 { value: "number", label: "number"},
 { value: "yes/no", label: "yes/no"},
 { value: "list", label: "list"},
 ];

 return (
 <div className="py-1">
 <DropdownButton
 icon={style.icon}
 label={typeLabel}
 value={typeLabel}
 options={availableOptions}
 onChange={(value) => handleTypeChange(row.original, value)}
 align="start"
 className="w-32"
 />
 </div>
 );
 }

 return (
 <div className="py-1">
 <Badge
 variant="outline"
 className={cn(
"flex items-center justify-start gap-1.5 px-3 py-1.5 text-xs font-semibold",
"backdrop-blur-sm shadow-sm ring-1 w-24",
 style.color,
 style.bg,
 style.border,
"ring-slate-200/20"
 )}
 >
 {style.icon}
 <span>{typeLabel}</span>
 </Badge>
 </div>
 );
 },
 },
 {
 accessorKey: "description",
 header: "Description",
 cell: ({ row }) => {
 const isEditing = editable && editingCell?.rowId === row.id && editingCell?.column === "description";
 const description = row.original.description || "";

 return (
 <div className="w-full min-w-[250px] max-w-[500px] py-1">
 {isEditing ? (
 <div className="flex flex-col gap-2 w-full min-w-[250px] max-w-[500px]"onClick={(e) => e.stopPropagation()}>
 <Textarea
 value={editValue}
 onChange={(e) => {
 e.stopPropagation();
 setEditValue(e.target.value);
 }}
 onKeyDown={(e) => {
 e.stopPropagation();
 if (e.key === "Escape") {
 e.preventDefault();
 handleCellCancel();
 }
 }}
 onBlur={(e) => {
 e.stopPropagation();
 // Small delay to allow button clicks to register
 setTimeout(() => {
 if (editingCell?.rowId === row.id && editingCell?.column === "description") {
 handleCellSave(row.original);
 }
 }, 200);
 }}
 autoFocus
 className={cn(
"text-sm min-h-[80px] resize-none w-full",
"bg-white",
"border-2 border-primary/50",
"ring-2 ring-primary/20",
"focus:border-primary focus:ring-primary/40"
 )}
 onClick={(e) => e.stopPropagation()}
 onFocus={(e) => e.stopPropagation()}
 placeholder="Enter field description..."
 />
 <div className="flex items-center gap-2 justify-end">
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleCellSave(row.original);
 }}
 className="px-3 py-1.5 text-xs font-medium hover:bg-primary/10 rounded transition-colors flex items-center gap-1.5"
 title="Save"
 >
 <Check className="h-3.5 w-3.5 text-primary"/>
 <span className="text-primary">Save</span>
 </button>
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleCellCancel();
 }}
 className="px-3 py-1.5 text-xs font-medium hover:bg-destructive/10 rounded transition-colors flex items-center gap-1.5"
 title="Cancel"
 >
 <X className="h-3.5 w-3.5 text-destructive"/>
 <span className="text-destructive">Cancel</span>
 </button>
 </div>
 </div>
 ) : (
 <div
 onClick={(e) => {
 if (editable && onFieldUpdate) {
 e.stopPropagation();
 handleCellEdit(row.id,"description", description);
 }
 }}
 className={cn(
 editable && onFieldUpdate &&"cursor-pointer hover:bg-primary/5 rounded p-2 -m-2 transition-colors"
 )}
 >
 {description ? (
 <p className="text-sm text-foreground/80 leading-relaxed break-words">
 {description}
 </p>
 ) : (
 <span className="text-xs text-muted-foreground/60 italic">
 {editable && onFieldUpdate ? "Click to add description": "No description provided"}
 </span>
 )}
 </div>
 )}
 </div>
 );
 },
 },
 ];

 const table = useReactTable({
 data: fields,
 columns,
 getCoreRowModel: getCoreRowModel(),
 onSortingChange: setSorting,
 getSortedRowModel: getSortedRowModel(),
 onColumnFiltersChange: setColumnFilters,
 getFilteredRowModel: getFilteredRowModel(),
 onColumnVisibilityChange: setColumnVisibility,
 onGlobalFilterChange: setGlobalFilter,
 state: {
 sorting,
 columnFilters,
 columnVisibility,
 globalFilter,
 },
 });

 return (
 <div className="space-y-6">
 {/* Toolbar */}
 <div className="flex items-center gap-4">
 {/* Search */}
 <div className="flex-1 max-w-md relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10"/>
 <Input
 placeholder="Search all fields..."
 value={globalFilter ?? ""}
 onChange={(event) => setGlobalFilter(event.target.value)}
 className="pl-10 h-10 backdrop-blur-xl bg-white/60 border-slate-200/50 shadow-lg shadow-slate-200/20 ring-1 ring-slate-200/20 transition-all hover:bg-white/80 focus:ring-2 focus:ring-primary/20"
 />
 </div>
 {/* Stats - next to search input */}
 <div className="text-sm font-medium text-foreground/70 backdrop-blur-sm bg-white/40 rounded-lg px-4 py-2 border border-slate-200/30 shadow-sm">
 Showing <span className="text-foreground font-semibold">{table.getFilteredRowModel().rows.length}</span> of{""}
 <span className="text-foreground font-semibold">{fields.length}</span> fields
 </div>
 </div>

 {/* Table */}
 <div className="rounded-xl border border-slate-200/40 overflow-hidden backdrop-blur-2xl bg-gradient-to-br from-white/80 via-white/70 to-white/60 shadow-2xl shadow-slate-200/20 ring-1 ring-white/20">
 <Table>
 <TableHeader>
 {table.getHeaderGroups().map((headerGroup) => (
 <TableRow
 key={headerGroup.id}
 className="backdrop-blur-xl bg-gradient-to-r from-slate-50/90 via-slate-50/80 to-slate-50/90 border-b border-slate-200/40 shadow-sm"
 >
 {headerGroup.headers.map((header) => {
 return (
 <TableHead
 key={header.id}
 className="whitespace-nowrap font-semibold text-sm text-foreground py-4 px-6"
 >
 {header.isPlaceholder ? null : (
 <div
 className={
 header.column.getCanSort()
 ? "cursor-pointer select-none flex items-center gap-2 hover:text-foreground transition-all hover:scale-[1.02]"
 : ""
 }
 onClick={header.column.getToggleSortingHandler()}
 >
 {flexRender(
 header.column.columnDef.header,
 header.getContext()
 )}
 {{
 asc: "🔼",
 desc: "🔽",
 }[header.column.getIsSorted() as string] ?? null}
 </div>
 )}
 </TableHead>
 );
 })}
 </TableRow>
 ))}
 </TableHeader>
 <TableBody>
 {table.getRowModel().rows?.length ? (
 table.getRowModel().rows.map((row, index) => {
 const isNested = row.original.level > 0;
 return (
 <TableRow
 key={row.id}
 data-state={row.getIsSelected() &&"selected"}
 className={cn(
 onRowClick && !editingCell &&"cursor-pointer transition-all duration-200",
"border-b border-slate-100/30",
 isNested
 ? "backdrop-blur-sm bg-primary/3"
 : index % 2 === 0
 ? "backdrop-blur-sm bg-white/50"
 : "backdrop-blur-sm bg-slate-50/40",
 !editingCell &&"hover:bg-gradient-to-r hover:from-primary/5 hover:via-primary/3 hover:to-transparent hover:backdrop-blur-md hover:shadow-sm hover:border-primary/20 transition-all duration-200"
 )}
 onClick={() => {
 if (!editingCell) {
 onRowClick?.(row.original);
 }
 }}
 >
 {row.getVisibleCells().map((cell) => (
 <TableCell
 key={cell.id}
 className="whitespace-normal break-words py-4 px-6 align-top"
 >
 {flexRender(
 cell.column.columnDef.cell,
 cell.getContext()
 )}
 </TableCell>
 ))}
 </TableRow>
 );
 })
 ) : (
 <TableRow>
 <TableCell
 colSpan={columns.length}
 className="h-24 text-center text-muted-foreground backdrop-blur-sm bg-white/30"
 >
 No fields found.
 </TableCell>
 </TableRow>
 )}
 </TableBody>
 </Table>
 </div>
 </div>
 );
}
